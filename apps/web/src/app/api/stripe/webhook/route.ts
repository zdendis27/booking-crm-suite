import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getStripe, stripeConfigured, stripeMissing } from "@/lib/server/stripe";

function verify(stripe: Stripe, body: string, signature: string): Stripe.Event | null {
  for (const secret of [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]) {
    if (!secret) continue;
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch {
      continue;
    }
  }
  return null;
}

async function onCheckoutCompleted(admin: ReturnType<typeof createSupabaseAdmin>, session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  const salonId = meta.salon_id;
  if (!salonId) return;
  if (meta.purpose === "subscription") {
    await admin
      .from("subscriptions")
      .update({ plan_code: meta.plan, status: "active", stripe_customer_id: typeof session.customer === "string" ? session.customer : null, stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null })
      .eq("salon_id", salonId);
    return;
  }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  if (!intent || session.payment_status !== "paid") return;
  if (meta.purpose === "deposit" && meta.booking_id) {
    await admin.rpc("record_stripe_payment", { p_salon: salonId, p_booking: meta.booking_id, p_amount: session.amount_total ?? 0, p_payment_intent: intent, p_kind: "deposit" });
    return;
  }
  if (meta.purpose === "voucher") {
    await admin.rpc("issue_paid_voucher", {
      p_salon: salonId,
      p_amount: session.amount_total ?? 0,
      p_payment_intent: intent,
      p_service: meta.service_id || undefined,
      p_recipient_name: meta.recipient_name || undefined,
      p_recipient_email: meta.recipient_email || undefined,
      p_message: meta.message || undefined,
      p_buyer: meta.buyer_id || undefined,
    });
  }
}

async function onSubscription(admin: ReturnType<typeof createSupabaseAdmin>, subscription: Stripe.Subscription, deleted: boolean) {
  const salonId = subscription.metadata?.salon_id;
  if (!salonId) return;
  const periodEnd = (subscription.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
  const active = !deleted && ["active", "trialing", "past_due"].includes(subscription.status);
  await admin
    .from("subscriptions")
    .update({
      status: deleted ? "canceled" : subscription.status,
      plan_code: active ? (subscription.metadata?.plan ?? "free") : "free",
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("salon_id", salonId);
}

async function onAccount(admin: ReturnType<typeof createSupabaseAdmin>, account: Stripe.Account) {
  await admin
    .from("stripe_accounts")
    .update({ charges_enabled: !!account.charges_enabled, payouts_enabled: !!account.payouts_enabled, details_submitted: !!account.details_submitted })
    .eq("stripe_account_id", account.id);
}

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return stripeMissing();
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Chybí podpis" }, { status: 400 });
  const event = verify(stripe, await request.text(), signature);
  if (!event) return NextResponse.json({ error: "Neplatný podpis" }, { status: 400 });

  const admin = createSupabaseAdmin();
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await onCheckoutCompleted(admin, event.data.object);
        break;
      case "customer.subscription.updated":
        await onSubscription(admin, event.data.object, false);
        break;
      case "customer.subscription.deleted":
        await onSubscription(admin, event.data.object, true);
        break;
      case "account.updated":
        await onAccount(admin, event.data.object);
        break;
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
