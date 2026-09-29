import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("stripe_not_configured");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeMissing = () => NextResponse.json({ error: "Platby přes Stripe zatím nejsou zapnuté. Doplňte STRIPE_SECRET_KEY v nastavení serveru." }, { status: 503 });

export async function requireSalonOwner(salonId: string, roles: string[] = ["owner"]) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Nepřihlášeno" }, { status: 401 }) } as const;
  const { data } = await supabase.from("memberships").select("role").eq("salon_id", salonId).eq("user_id", user.id).maybeSingle();
  if (!data || !roles.includes(data.role)) return { error: NextResponse.json({ error: "Nemáte oprávnění" }, { status: 403 }) } as const;
  return { user, supabase } as const;
}
