import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { requireSalonOwner } from "@/lib/server/stripe";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Nedostupné" }, { status: 404 });
  const { salonId, plan } = (await request.json().catch(() => ({}))) as { salonId?: string; plan?: string };
  if (!salonId || !plan) return NextResponse.json({ error: "Chybí údaje" }, { status: 400 });
  const auth = await requireSalonOwner(salonId);
  if ("error" in auth) return auth.error;
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("subscriptions").update({ plan_code: plan, status: "active" }).eq("salon_id", salonId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
