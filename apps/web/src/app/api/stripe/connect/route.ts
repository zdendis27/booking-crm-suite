import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appUrl } from "@/lib/server/tokens";
import { getStripe, requireSalonOwner, stripeConfigured, stripeMissing } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return stripeMissing();
  const { salonId } = (await request.json().catch(() => ({}))) as { salonId?: string };
  if (!salonId) return NextResponse.json({ error: "Chybí salon" }, { status: 400 });
  const auth = await requireSalonOwner(salonId);
  if ("error" in auth) return auth.error;

  const admin = createSupabaseAdmin();
  const stripe = getStripe();
  const { data: salon } = await admin.from("salons").select("slug,name").eq("id", salonId).single();
  if (!salon) return NextResponse.json({ error: "Salon nenalezen" }, { status: 404 });

  const { data: existing } = await admin.from("stripe_accounts").select("stripe_account_id").eq("salon_id", salonId).maybeSingle();
  let accountId = existing?.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "CZ",
      email: auth.user.email ?? undefined,
      business_profile: { name: salon.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { salon_id: salonId },
    });
    accountId = account.id;
    await admin.from("stripe_accounts").insert({ salon_id: salonId, stripe_account_id: accountId });
  }
  const base = appUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/app/${salon.slug}/nastaveni/rezervace?stripe=obnovit`,
    return_url: `${base}/app/${salon.slug}/nastaveni/rezervace?stripe=hotovo`,
  });
  return NextResponse.json({ url: link.url });
}
