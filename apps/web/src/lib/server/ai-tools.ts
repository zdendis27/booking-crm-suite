import type { SupabaseClient } from "@supabase/supabase-js";
import { weekdayNames } from "@repo/copy";
import { czk, percent } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export interface AiBlock {
  type: "table" | "stats";
  title: string;
  columns?: string[];
  rows?: (string | number)[][];
  stats?: { label: string; value: string; tone?: "good" | "bad" | "neutral" }[];
}

export interface ToolResult {
  data: unknown;
  block?: AiBlock;
}

const day = (offset: number, base = new Date()) => {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
  return d.toISOString().slice(0, 10);
};

function monthRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const elapsed = Math.max(1, now.getUTCDate());
  const prevEnd = new Date(Date.UTC(prevStart.getUTCFullYear(), prevStart.getUTCMonth(), elapsed));
  const prevMonthEnd = new Date(Date.UTC(prevStart.getUTCFullYear(), prevStart.getUTCMonth() + 1, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: day(0, now),
    prevFrom: prevStart.toISOString().slice(0, 10),
    prevTo: (prevEnd > prevMonthEnd ? prevMonthEnd : prevEnd).toISOString().slice(0, 10),
    elapsed,
  };
}

async function snapshot(sb: SupabaseClient, salon: string, from: string, to: string): Promise<Snapshot> {
  const { data, error } = await sb.rpc("owner_snapshot", { p_salon: salon, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data as Snapshot;
}

const pct = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : a ? 1 : 0);
const signed = (ratio: number) => `${ratio >= 0 ? "+" : "−"}${Math.abs(ratio * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} %`;

export async function explainRevenueChange(sb: SupabaseClient, salon: string): Promise<ToolResult & { text: string }> {
  const r = monthRange(new Date());
  const [cur, prev] = await Promise.all([snapshot(sb, salon, r.from, r.to), snapshot(sb, salon, r.prevFrom, r.prevTo)]);
  const revenueDelta = pct(cur.revenue.received, prev.revenue.received);
  const findings: { impact: number; text: string }[] = [];

  const bookingsDelta = pct(cur.bookings.completed, prev.bookings.completed);
  if (Math.abs(bookingsDelta) > 0.05) findings.push({ impact: Math.abs(bookingsDelta) * 1.2, text: `Počet dokončených návštěv je ${signed(bookingsDelta)} (${cur.bookings.completed} oproti ${prev.bookings.completed}).` });
  const spendDelta = pct(cur.average_spend, prev.average_spend);
  if (Math.abs(spendDelta) > 0.05) findings.push({ impact: Math.abs(spendDelta), text: `Průměrná útrata na návštěvu je ${signed(spendDelta)} (${czk(cur.average_spend)} oproti ${czk(prev.average_spend)}).` });
  const occDelta = cur.occupancy.ratio - prev.occupancy.ratio;
  if (Math.abs(occDelta) > 0.03) findings.push({ impact: Math.abs(occDelta) * 2, text: `Obsazenost je ${occDelta > 0 ? "vyšší" : "nižší"} o ${Math.abs(occDelta * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} p. b. (${percent(cur.occupancy.ratio)} oproti ${percent(prev.occupancy.ratio)}).` });
  if (cur.bookings.no_show > prev.bookings.no_show) findings.push({ impact: 0.2 + (cur.bookings.no_show - prev.bookings.no_show) * 0.05, text: `Klienti se častěji nedostavili: ${cur.bookings.no_show}× oproti ${prev.bookings.no_show}×.` });
  if (cur.bookings.cancelled > prev.bookings.cancelled + 2) findings.push({ impact: 0.25, text: `Přibylo zrušených rezervací: ${cur.bookings.cancelled} oproti ${prev.bookings.cancelled}.` });
  if (cur.clients.new < prev.clients.new * 0.8 && prev.clients.new >= 3) findings.push({ impact: 0.3, text: `Přišlo méně nových klientů: ${cur.clients.new} oproti ${prev.clients.new}.` });
  if (cur.revenue.discounts > prev.revenue.discounts * 1.3 && cur.revenue.discounts > 0) findings.push({ impact: 0.15, text: `Vyšší slevy a odměny: ${czk(cur.revenue.discounts)} oproti ${czk(prev.revenue.discounts)}.` });

  const prevServices = new Map(prev.by_service.map((s) => [s.name, s.revenue]));
  const serviceDeltas = cur.by_service.map((s) => ({ name: s.name, delta: s.revenue - (prevServices.get(s.name) ?? 0) })).concat(prev.by_service.filter((s) => !cur.by_service.some((c) => c.name === s.name)).map((s) => ({ name: s.name, delta: -s.revenue })));
  const worstService = serviceDeltas.sort((a, b) => a.delta - b.delta)[0];
  if (worstService && worstService.delta < 0 && prev.revenue.earned > 0) findings.push({ impact: Math.abs(worstService.delta) / prev.revenue.earned, text: `Nejvíc ubyla služba „${worstService.name}“: ${czk(worstService.delta)} oproti stejnému období.` });

  const prevStaff = new Map((prev.by_staff ?? []).map((s) => [s.staff_id, s.revenue]));
  const staffDeltas = (cur.by_staff ?? []).map((s) => ({ name: s.name, delta: s.revenue - (prevStaff.get(s.staff_id) ?? 0) })).sort((a, b) => a.delta - b.delta);
  if (staffDeltas[0] && staffDeltas[0].delta < 0 && prev.revenue.earned > 0) findings.push({ impact: Math.abs(staffDeltas[0].delta) / prev.revenue.earned, text: `Nejnižší růst má ${staffDeltas[0].name}: tržby ${czk(staffDeltas[0].delta)} oproti stejnému období.` });

  findings.sort((a, b) => b.impact - a.impact);
  const top = findings.slice(0, 4);
  const headline =
    Math.abs(revenueDelta) < 0.03
      ? `Tržby jsou zhruba stejné jako ve stejném období minulého měsíce (${czk(cur.revenue.received)} oproti ${czk(prev.revenue.received)}).`
      : `Tržby jsou ${revenueDelta < 0 ? "nižší" : "vyšší"} o ${Math.abs(revenueDelta * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} % (${czk(cur.revenue.received)} oproti ${czk(prev.revenue.received)} za prvních ${r.elapsed} dní).`;
  const text = top.length ? `${headline}\n\nCo to nejspíš způsobuje:\n${top.map((f, i) => `${i + 1}. ${f.text}`).join("\n")}` : `${headline}\n\nV datech jsem nenašel jednoznačnou příčinu, změna je rozložena rovnoměrně.`;

  return {
    text,
    data: { current: cur.revenue, previous: prev.revenue, findings: top.map((f) => f.text) },
    block: {
      type: "stats",
      title: `Prvních ${r.elapsed} dní měsíce vs. minulý měsíc`,
      stats: [
        { label: "Tržby", value: czk(cur.revenue.received), tone: revenueDelta >= 0 ? "good" : "bad" },
        { label: "Změna", value: signed(revenueDelta), tone: revenueDelta >= 0 ? "good" : "bad" },
        { label: "Návštěv", value: String(cur.bookings.completed), tone: bookingsDelta >= 0 ? "good" : "bad" },
        { label: "Průměrná útrata", value: czk(cur.average_spend), tone: spendDelta >= 0 ? "good" : "bad" },
        { label: "Obsazenost", value: percent(cur.occupancy.ratio), tone: occDelta >= 0 ? "good" : "bad" },
      ],
    },
  };
}

export async function topServices(sb: SupabaseClient, salon: string, days = 30): Promise<ToolResult & { text: string }> {
  const snap = await snapshot(sb, salon, day(-days + 1), day(0));
  const total = snap.by_service.reduce((s, x) => s + x.revenue, 0);
  if (!snap.by_service.length) return { text: "Za zvolené období zatím nemám dokončené návštěvy.", data: [] };
  const best = snap.by_service[0]!;
  const text = `Nejvíc vám za posledních ${days} dní vydělává služba „${best.name}“: ${czk(best.revenue)} (${percent(total ? best.revenue / total : 0)} tržeb ze služeb), ${best.count} návštěv.`;
  return {
    text,
    data: snap.by_service,
    block: { type: "table", title: "Služby podle tržeb", columns: ["Služba", "Návštěv", "Tržby", "Podíl"], rows: snap.by_service.slice(0, 8).map((s) => [s.name, s.count, czk(s.revenue), percent(total ? s.revenue / total : 0)]) },
  };
}

export async function worstDays(sb: SupabaseClient, salon: string, days = 60): Promise<ToolResult & { text: string }> {
  const snap = await snapshot(sb, salon, day(-days + 1), day(0));
  const rows = snap.by_weekday.filter((r) => r.scheduled_min > 0).sort((a, b) => a.ratio - b.ratio);
  if (!rows.length) return { text: "Zatím nemám dost dat o pracovní době a rezervacích.", data: [] };
  const worst = rows[0]!;
  const best = rows[rows.length - 1]!;
  const text = `Nejnižší obsazenost máte v ${weekdayNames[worst.weekday - 1]!.toLowerCase()} (${percent(worst.ratio)}), nejvyšší v ${weekdayNames[best.weekday - 1]!.toLowerCase()} (${percent(best.ratio)}). Zvažte cílenou akci nebo slevu na nejslabší den.`;
  return {
    text,
    data: rows,
    block: { type: "table", title: `Obsazenost podle dne (posledních ${days} dní)`, columns: ["Den", "Rezervací", "Obsazenost"], rows: [...rows].sort((a, b) => a.weekday - b.weekday).map((r) => [weekdayNames[r.weekday - 1]!, r.bookings, percent(r.ratio)]) },
  };
}

export async function clientsDueForReturn(sb: SupabaseClient, salon: string, limit = 12): Promise<ToolResult & { text: string; count: number }> {
  const { data, error } = await sb
    .from("client_stats")
    .select("client_id,next_expected_at,avg_interval_days,last_visit_at,visits_count, clients!inner(full_name,phone,email,anonymized_at)")
    .eq("salon_id", salon)
    .lt("next_expected_at", new Date().toISOString())
    .not("avg_interval_days", "is", null)
    .order("next_expected_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as any[]).filter((r) => !r.clients?.anonymized_at);
  if (!rows.length) return { text: "Nikdo z pravidelných klientů zatím nepřekročil svou obvyklou dobu mezi návštěvami.", data: [], count: 0 };
  const now = Date.now();
  const table = rows.map((r) => [r.clients.full_name, `${r.visits_count}×`, `každých ${Math.round(r.avg_interval_days)} dní`, `${Math.max(0, Math.round((now - Date.parse(r.next_expected_at)) / 86400000))} dní po termínu`]);
  return {
    count: rows.length,
    text: `Nejdřív se pravděpodobně vrátí (nebo by měli dostat pozvánku) tito klienti. Je jich ${rows.length}. Systém jim pozvánku pošle automaticky, pokud máte zapnutou připomínku vrácení klienta. Můžete jim také poslat kampaň.`,
    data: rows.map((r) => ({ name: r.clients.full_name, avg_interval_days: r.avg_interval_days, next_expected_at: r.next_expected_at })),
    block: { type: "table", title: "Klienti po své obvyklé době", columns: ["Klient", "Návštěv", "Chodí", "Zpoždění"], rows: table },
  };
}

export async function staffPerformance(sb: SupabaseClient, salon: string, days = 30): Promise<ToolResult & { text: string }> {
  const snap = await snapshot(sb, salon, day(-days + 1), day(0));
  const rows = (snap.by_staff ?? []).filter((s) => s.revenue > 0 || s.bookings > 0).sort((a, b) => b.revenue - a.revenue);
  if (!rows.length) return { text: "Za zvolené období nemám data o výkonu týmu.", data: [] };
  return {
    text: `Nejvyšší tržby za posledních ${days} dní má ${rows[0]!.name} (${czk(rows[0]!.revenue)}).`,
    data: rows,
    block: { type: "table", title: "Výkon týmu", columns: ["Pracovník", "Tržby", "Klientů", "Obsazenost"], rows: rows.map((s) => [s.name, czk(s.revenue), s.clients, percent(s.scheduled_min ? s.booked_min / s.scheduled_min : 0)]) },
  };
}

export async function overview(sb: SupabaseClient, salon: string): Promise<ToolResult & { text: string }> {
  const r = monthRange(new Date());
  const cur = await snapshot(sb, salon, r.from, r.to);
  return {
    text: `Tento měsíc máte ${czk(cur.revenue.received)} v tržbách, ${cur.bookings.completed} dokončených návštěv a obsazenost ${percent(cur.occupancy.ratio)}. Zeptejte se mě třeba, proč se změnily tržby, která služba vydělává nejvíc nebo komu poslat připomínku.`,
    data: cur,
    block: { type: "stats", title: "Tento měsíc", stats: [{ label: "Tržby", value: czk(cur.revenue.received) }, { label: "Návštěv", value: String(cur.bookings.completed) }, { label: "Průměrná útrata", value: czk(cur.average_spend) }, { label: "Obsazenost", value: percent(cur.occupancy.ratio) }] },
  };
}

export type Intent = "revenue_change" | "top_services" | "worst_days" | "due_clients" | "staff" | "overview";

export function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(pokles|klesl|klesn|propad|méně tržeb|nižší tržb|proč.*tržb|tržb.*proč)/.test(q)) return "revenue_change";
  if (/(služb|vydělává|nejvíc.*peněz|nejziskovější)/.test(q)) return "top_services";
  if (/(obsazen|nejhorší dny|nejhorší den|volno|prázdn)/.test(q)) return "worst_days";
  if (/(připomín|komu.*poslat|přijdou|vrátí|vrátit|znovu|neaktivn|dlouho nebyl)/.test(q)) return "due_clients";
  if (/(zaměstnan|pracovník|barber|tým|výkon)/.test(q)) return "staff";
  return "overview";
}

export async function runIntent(sb: SupabaseClient, salon: string, intent: Intent) {
  switch (intent) {
    case "revenue_change":
      return explainRevenueChange(sb, salon);
    case "top_services":
      return topServices(sb, salon);
    case "worst_days":
      return worstDays(sb, salon);
    case "due_clients":
      return clientsDueForReturn(sb, salon);
    case "staff":
      return staffPerformance(sb, salon);
    default:
      return overview(sb, salon);
  }
}
