import { brand, defaultTemplates, renderTemplate } from "@repo/copy";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "./email";
import { renderEmailHtml } from "./email-html";
import { pushConfigured, sendPush } from "./push";
import { appUrl, signToken } from "./tokens";

interface Claimed {
  id: string;
  salon_id: string;
  client_id: string | null;
  user_id: string | null;
  booking_id: string | null;
  channel: "email" | "push" | "sms" | "in_app";
  type: string;
  recipient: string | null;
  payload: Record<string, any>;
  attempts: number;
}

const marketingTypes = new Set(["return_reminder", "birthday", "campaign"]);

function formatDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(iso));
}

function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone, hourCycle: "h23" }).format(new Date(iso));
}

function buildVariables(n: Claimed, salon: { name: string; slug: string; google_review_url: string | null }) {
  const p = n.payload;
  const tz = p.timezone ?? "Europe/Prague";
  const base = appUrl();
  const bookLink = `${base}/s/${salon.slug}/rezervace`;
  const start = p.starts_at as string | undefined;
  return {
    first_name: p.client?.first_name ?? p.first_name ?? "",
    salon: p.salon?.name ?? salon.name,
    date: start ? formatDate(start, tz) : "",
    time: start ? formatTime(start, tz) : "",
    services: Array.isArray(p.services) ? p.services.map((s: any) => s.name).join(", ") : "",
    staff: Array.isArray(p.staff) ? p.staff.join(", ") : "",
    address: [p.location?.street, p.location?.city].filter(Boolean).join(", "),
    manage_link: `${base}/moje`,
    book_link: bookLink,
    review_link: salon.google_review_url ?? "",
    days: p.days_since_last_visit ?? "",
    interval: p.avg_interval_days ? Math.round(p.avg_interval_days) : "",
    reward_line: p.available_rewards > 0 ? "\n\nMáte také k dispozici věrnostní odměnu, uplatníte ji při další návštěvě." : "",
    offer_line: p.offer ? `\n\n${p.offer}` : "",
  };
}

async function loadTemplate(admin: ReturnType<typeof createSupabaseAdmin>, salonId: string, type: string, channel: "email" | "sms") {
  const { data } = await admin.from("notification_templates").select("subject,body").eq("salon_id", salonId).eq("type", type as never).eq("channel", channel).maybeSingle();
  return data;
}

async function fillClient(admin: ReturnType<typeof createSupabaseAdmin>, n: Claimed) {
  if (n.payload.client?.first_name || n.payload.first_name || !n.client_id) return;
  const { data } = await admin.from("clients").select("first_name").eq("id", n.client_id).maybeSingle();
  if (data) n.payload = { ...n.payload, first_name: data.first_name };
}

async function processEmail(admin: ReturnType<typeof createSupabaseAdmin>, n: Claimed) {
  const { data: salon } = await admin.from("salons").select("name,slug,brand_color,google_review_url").eq("id", n.salon_id).single();
  if (!salon) throw new Error("salon_not_found");
  if (n.type === "review_request" && !salon.google_review_url) return { skip: "missing_review_url" as const };
  await fillClient(admin, n);
  const vars = buildVariables(n, salon);
  let subject: string;
  let body: string;
  if (n.type === "campaign") {
    subject = renderTemplate(n.payload.subject ?? "", vars);
    body = renderTemplate(n.payload.body ?? "", vars);
  } else {
    const fallback = defaultTemplates[n.type];
    if (!fallback) return { skip: "unknown_type" as const };
    const custom = await loadTemplate(admin, n.salon_id, n.type, "email");
    subject = renderTemplate(custom?.subject ?? fallback.subject, vars);
    body = renderTemplate(custom?.body ?? fallback.body, vars);
  }
  const cta =
    n.type === "review_request" ? { label: "Ohodnotit návštěvu", url: vars.review_link } : ["booking_confirmation", "booking_reminder", "booking_received", "booking_rescheduled"].includes(n.type) ? { label: "Spravovat rezervaci", url: vars.manage_link } : { label: "Rezervovat termín", url: vars.book_link };
  const unsubscribe = marketingTypes.has(n.type) && n.client_id ? `${appUrl()}/odhlasit?c=${n.client_id}&t=${signToken(n.client_id)}` : null;
  const html = renderEmailHtml({ salonName: salon.name, accent: salon.brand_color, title: subject, body, cta, unsubscribeUrl: unsubscribe, productName: brand.name });
  const result = await sendEmail({ to: n.recipient!, subject, html, text: body });
  return { providerId: result.id ?? `console:${result.transport}` };
}

async function processPush(admin: ReturnType<typeof createSupabaseAdmin>, n: Claimed) {
  if (!pushConfigured()) return { skip: "push_not_configured" as const };
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", n.user_id!).is("disabled_at", null);
  if (!subs?.length) return { skip: "no_subscription" as const };
  const { data: salon } = await admin.from("salons").select("name,slug,google_review_url").eq("id", n.salon_id).single();
  await fillClient(admin, n);
  const vars = buildVariables(n, salon ?? { name: "", slug: "", google_review_url: null });
  const fallback = defaultTemplates[n.type];
  const staffTitles: Record<string, string> = { staff_new_booking: "Nová rezervace", staff_booking_pending: "Rezervace čeká na potvrzení", staff_booking_cancelled: "Klient zrušil rezervaci", staff_booking_moved: "Klient přesunul rezervaci" };
  const title = fallback ? renderTemplate(fallback.pushTitle, vars) : (staffTitles[n.type] ?? "Upozornění");
  const staffBody = `${n.payload.client?.first_name ?? ""} ${n.payload.client?.last_name ?? ""} · ${vars.date} ${vars.time}`.trim();
  const body = fallback ? renderTemplate(fallback.pushBody, vars) : staffBody;
  const url = n.type.startsWith("staff_") && n.payload.salon?.slug ? `/app/${n.payload.salon.slug}/kalendar?rezervace=${n.booking_id}` : "/moje";
  let delivered = 0;
  for (const sub of subs) {
    const outcome = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { title, body, url });
    if (outcome === "gone") await admin.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("id", sub.id);
    else delivered++;
  }
  return delivered ? { providerId: `push:${delivered}` } : { skip: "subscription_gone" as const };
}

export async function runWorker(limit = 50) {
  const admin = createSupabaseAdmin();
  const maintenance: Record<string, unknown> = {};
  for (const fn of ["expire_pending_bookings", "expire_vouchers", "expire_loyalty_rewards", "enqueue_return_reminders", "enqueue_birthdays"] as const) {
    const { data, error } = await admin.rpc(fn);
    maintenance[fn] = error ? `chyba: ${error.message}` : data;
  }

  const { data: batch, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error(error.message);
  const stats = { sent: 0, skipped: 0, failed: 0 };
  for (const n of (batch ?? []) as unknown as Claimed[]) {
    try {
      let outcome: { providerId?: string; skip?: string };
      if (n.channel === "email") outcome = await processEmail(admin, n);
      else if (n.channel === "push") outcome = await processPush(admin, n);
      else outcome = { skip: "sms_provider_not_configured" };
      if (outcome.skip) {
        await admin.rpc("skip_notification", { p_id: n.id, p_reason: outcome.skip });
        stats.skipped++;
      } else {
        await admin.rpc("complete_notification", { p_id: n.id, p_provider_id: outcome.providerId });
        stats.sent++;
      }
    } catch (failure) {
      await admin.rpc("fail_notification", { p_id: n.id, p_error: (failure as Error).message, p_permanent: false });
      stats.failed++;
    }
  }
  return { claimed: (batch ?? []).length, ...stats, maintenance };
}
