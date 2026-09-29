import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appUrl } from "@/lib/server/tokens";
import { getStripe, requireSalonOwner, stripeConfigured, stripeMissing } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  const { salonId, plan } = (await request.json().catch(() => ({}))) as { salonId?: string; plan?: string };
  if (!salonId || !plan) return NextResponse.json({ error: "Chybí údaje" }, { status: 400 });
  const auth = await requireSalonOwner(salonId);
  if ("error" in auth) return auth.error;

  const admin = createSupabaseAdmin();
  const { data: target } = await admin.from("plans").select("code,name,price_monthly").eq("code", plan).single();
  if (!target) return NextResponse.json({ error: "Neznámý tarif" }, { status: 404 });
  const { data: salon } = await admin.from("salons").select("slug,name").eq("id", salonId).single();
  if (!salon) return NextResponse.json({ error: "Salon nenalezen" }, { status: 404 });

  if (target.price_monthly === 0) {
    await admin.from("subscriptions").update({ plan_code: target.code, status: "active" }).eq("salon_id", salonId);
    return NextResponse.json({ url: `${appUrl()}/app/${salon.slug}/nastaveni/tarif?zmena=ok` });
  }
  if (!stripeConfigured()) return stripeMissing();

  const stripe = getStripe();
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("salon_id", salonId).maybeSingle();
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: auth.user.email ?? undefined, name: salon.name, metadata: { salon_id: salonId } });
    customerId = customer.id;
    await admin.from("subscriptions").update({ stripe_customer_id: customerId }).eq("salon_id", salonId);
  }
  const base = appUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    locale: "cs",
    client_reference_id: salonId,
    line_items: [{ quantity: 1, price_data: { currency: "czk", unit_amount: Number(target.price_monthly), recurring: { interval: "month" }, product_data: { name: `Tarif ${target.name}` } } }],
    subscription_data: { metadata: { salon_id: salonId, plan: target.code } },
    metadata: { salon_id: salonId, plan: target.code, purpose: "subscription" },
    success_url: `${base}/app/${salon.slug}/nastaveni/tarif?zmena=ok`,
    cancel_url: `${base}/app/${salon.slug}/nastaveni/tarif`,
  });
  return NextResponse.json({ url: session.url });
}
