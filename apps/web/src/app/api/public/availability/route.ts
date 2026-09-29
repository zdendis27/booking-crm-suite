import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  if (!rateLimit(`avail:${clientIp(request.headers)}`, 90, 60_000)) return NextResponse.json({ error: "Příliš mnoho požadavků" }, { status: 429 });
  const params = request.nextUrl.searchParams;
  const location = params.get("location") ?? "";
  const services = (params.get("services") ?? "").split(",").filter(Boolean);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? from;
  const staff = params.get("staff");
  if (!uuid.test(location) || !services.length || services.length > 8 || !services.every((s) => uuid.test(s)) || !day.test(from) || !day.test(to) || (staff && !uuid.test(staff))) {
    return NextResponse.json({ error: "Neplatný dotaz" }, { status: 400 });
  }
  const span = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (span < 0 || span > 35) return NextResponse.json({ error: "Neplatné období" }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("get_availability", { p_location: location, p_service_ids: services, p_from: from, p_to: to, p_staff: staff || undefined });
  if (error) return NextResponse.json({ error: "Termíny se nepodařilo načíst" }, { status: 500 });
  return NextResponse.json({ slots: (data ?? []).map((row) => ({ staff_id: row.staff_id, start: row.slot_start, end: row.slot_end })) }, { headers: { "Cache-Control": "no-store" } });
}
