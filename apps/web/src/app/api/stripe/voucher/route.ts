import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { appUrl } from "@/lib/server/tokens";
import { getStripe, stripeConfigured, stripeMissing } from "@/lib/server/stripe";

interface Body {
  slug?: string;
  amount?: number;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return stripeMissing();
  if (!rateLimit(`voucher:${clientIp(request.headers)}`, 10, 60_000)) return NextResponse.json({ error: "Příliš mnoho požadavků" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as Body;
  const amount = Math.round(Number(body.amount));
  if (!body.slug || !Number.isFinite(amount) || amount < 20000 || amount > 5000000) return NextResponse.json({ error: "Zadejte hodnotu poukazu od 200 do 50 000 Kč" }, { status: 400 });
  if (body.recipientEmail && !/^\S+@\S+\.\S+$/.test(body.recipientEmail)) return NextResponse.json({ error: "Neplatný e-mail obdarovaného" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: salon } = await admin.from("salons").select("id,name,slug").eq("slug", body.slug.toLowerCase()).maybeSingle();
  if (!salon) return NextResponse.json({ error: "Salon nenalezen" }, { status: 404 });
  const { data: enabled } = await admin.rpc("plan_has_feature", { p_salon: salon.id, p_feature: "vouchers" });
  if (!enabled) return NextResponse.json({ error: "Tento salon poukazy neprodává" }, { status: 409 });
  const { data: account } = await admin.from("stripe_accounts").select("stripe_account_id,charges_enabled").eq("salon_id", salon.id).maybeSingle();
  if (!account?.charges_enabled) return NextResponse.json({ error: "Salon zatím nemá zapnuté online platby" }, { status: 409 });

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const base = appUrl();
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: "cs",
      customer_email: user?.email ?? body.recipientEmail ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: "czk", unit_amount: amount, product_data: { name: `Dárkový poukaz · ${salon.name}` } } }],
      metadata: {
        salon_id: salon.id,
        purpose: "voucher",
        recipient_name: (body.recipientName ?? "").slice(0, 100),
        recipient_email: (body.recipientEmail ?? "").slice(0, 200),
        message: (body.message ?? "").slice(0, 400),
        buyer_id: user?.id ?? "",
      },
      success_url: `${base}/s/${salon.slug}/poukaz?hotovo=1`,
      cancel_url: `${base}/s/${salon.slug}/poukaz`,
    },
    { stripeAccount: account.stripe_account_id },
  );
  return NextResponse.json({ url: session.url });
}
