import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { appUrl } from "@/lib/server/tokens";
import { getStripe, stripeConfigured, stripeMissing } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return stripeMissing();
  const { bookingId } = (await request.json().catch(() => ({}))) as { bookingId?: string };
  if (!bookingId) return NextResponse.json({ error: "Chybí rezervace" }, { status: 400 });
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });

  const { data: list } = await supabase.rpc("customer_bookings");
  const booking = (list ?? []).find((b) => b.id === bookingId);
  if (!booking || booking.status !== "pending" || !booking.deposit_amount || Number(booking.deposit_amount) <= 0) {
    return NextResponse.json({ error: "Tato rezervace nevyžaduje zálohu" }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data: account } = await admin.from("stripe_accounts").select("stripe_account_id,charges_enabled").eq("salon_id", booking.salon_id).maybeSingle();
  if (!account?.charges_enabled) return NextResponse.json({ error: "Salon zatím nemá zapnuté online platby" }, { status: 409 });

  const base = appUrl();
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      locale: "cs",
      customer_email: user.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: "czk", unit_amount: Number(booking.deposit_amount), product_data: { name: `Záloha na rezervaci · ${booking.salon_name}`, description: booking.services ?? undefined } } }],
      metadata: { salon_id: booking.salon_id, booking_id: booking.id, purpose: "deposit" },
      success_url: `${base}/moje?zaplaceno=${booking.id}`,
      cancel_url: `${base}/moje`,
    },
    { stripeAccount: account.stripe_account_id },
  );
  return NextResponse.json({ url: session.url });
}
