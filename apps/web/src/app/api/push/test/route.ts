import { NextResponse } from "next/server";
import { brand } from "@repo/copy";
import { pushConfigured, sendPush } from "@/lib/server/push";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Chybí VAPID klíče v nastavení serveru." }, { status: 503 });
  const { data: subs } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", user.id).is("disabled_at", null);
  if (!subs?.length) return NextResponse.json({ error: "Na tomto účtu není zapnuté žádné zařízení." }, { status: 404 });
  let sent = 0;
  for (const sub of subs) {
    const outcome = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { title: `${brand.name}: zkouška`, body: "Upozornění fungují. Nové rezervace uvidíte hned.", url: "/" }).catch(() => "gone" as const);
    if (outcome === "gone") await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("id", sub.id);
    else sent++;
  }
  return sent ? NextResponse.json({ ok: true, sent }) : NextResponse.json({ error: "Zařízení už není dostupné, zapněte upozornění znovu." }, { status: 410 });
}
