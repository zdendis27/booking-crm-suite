import { planNames } from "@repo/copy";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { SalonProvider, type Role } from "@/components/app/salon-context";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function SalonLayout({ children, params }: LayoutProps<"/app/[slug]">) {
  const { slug } = await params;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/prihlaseni?next=${encodeURIComponent(`/app/${slug}`)}`);

  const { data: salon } = await supabase
    .from("salons")
    .select("id,name,slug,timezone,plan_code,brand_color,verification_policy,logo_path,status,google_review_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!salon) notFound();

  const [membership, locations, plan, staff, account] = await Promise.all([
    supabase.from("memberships").select("role").eq("salon_id", salon.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("locations").select("id,name,slug").eq("salon_id", salon.id).is("archived_at", null).order("created_at"),
    supabase.from("plans").select("code,name,limits").eq("code", salon.plan_code).single(),
    supabase.from("staff").select("id").eq("salon_id", salon.id).eq("user_id", user.id).is("archived_at", null).maybeSingle(),
    supabase.from("customer_accounts").select("first_name,last_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!membership.data) notFound();

  const limits = (plan.data?.limits ?? {}) as { staff?: number; locations?: number; sms_included?: number; features?: string[] };
  const userName = [account.data?.first_name, account.data?.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "";

  return (
    <SalonProvider
      salon={{ ...salon, verification_policy: salon.verification_policy }}
      role={membership.data.role as Role}
      locations={locations.data ?? []}
      planName={planNames[salon.plan_code] ?? salon.plan_code}
      limits={{
        staff: limits.staff ?? 1,
        locations: limits.locations ?? 1,
        sms_included: limits.sms_included ?? 0,
        features: limits.features ?? [],
      }}
      staffId={staff.data?.id ?? null}
      userId={user.id}
      userEmail={user.email ?? ""}
      userName={userName}
    >
      <AppShell>{children}</AppShell>
    </SalonProvider>
  );
}
