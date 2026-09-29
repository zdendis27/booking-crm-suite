"use client";

import { featureLabels } from "@repo/copy";
import { Badge, Button, Card, ProgressBar, Skeleton, cn, useToast } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Check, MessageSquare, Sparkles, UserRound, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { useSb, useStaff } from "@/lib/data";

interface Plan {
  code: string;
  name: string;
  price_monthly: number;
  limits: { staff: number; locations: number; sms_included: number; features: string[] };
  sort: number;
}

export function PlanSettings() {
  const { salon, can, locations } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const router = useRouter();
  const staff = useStaff();
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = can(["owner"]);
  const dev = process.env.NODE_ENV !== "production";

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => ((await sb.from("plans").select("*").order("sort")).data ?? []) as unknown as Plan[],
  });
  const sms = useQuery({
    queryKey: ["sms-balance", salon.id],
    queryFn: async () => Number((await sb.rpc("salon_sms_balance", { p_salon: salon.id })).data ?? 0),
  });

  const current = (plans.data ?? []).find((p) => p.code === salon.plan_code);

  async function choose(plan: Plan) {
    setBusy(plan.code);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salonId: salon.id, plan: plan.code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Platbu se nepodařilo spustit");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Změna tarifu se nepodařila", (error as Error).message);
      setBusy(null);
    }
  }

  async function devSwitch(plan: Plan) {
    setBusy(plan.code);
    const response = await fetch("/api/dev/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salonId: salon.id, plan: plan.code }) });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      toast.error("Přepnutí selhalo", data.error);
      return;
    }
    toast.success(`Tarif přepnut na ${plan.name}`);
    router.refresh();
  }

  if (plans.isLoading) return <Skeleton className="h-96 rounded-lg" />;

  const staffUsed = (staff.data ?? []).length;

  return (
    <div className="grid gap-5">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:var(--gradient-mesh)]" />
        <div className="relative grid gap-6 sm:grid-cols-[1fr_1.4fr] sm:items-center">
          <div>
            <p className="text-sm text-fg-muted">Váš aktuální tarif</p>
            <p className="mt-1 flex items-center gap-3 text-3xl font-semibold tracking-tight">
              <span className="ui-gradient-text">{current?.name}</span>
            </p>
            <p className="mt-1 text-fg-muted">{current && current.price_monthly > 0 ? `${czk(current.price_monthly)} měsíčně` : "Zdarma"}</p>
          </div>
          <div className="grid gap-4">
            {[
              { icon: UserRound, label: "Pracovníci", used: staffUsed, max: current?.limits.staff ?? 1 },
              { icon: MapPin, label: "Pobočky", used: locations.length, max: current?.limits.locations ?? 1 },
              { icon: MessageSquare, label: "SMS kredity", used: sms.data ?? 0, max: current?.limits.sms_included ?? 0, remaining: true },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <row.icon className="h-4 w-4 text-accent" /> {row.label}
                  </span>
                  <span className="tabular text-fg-muted">{row.remaining ? `zbývá ${row.used}` : `${row.used} / ${row.max >= 999 ? "∞" : row.max}`}</span>
                </div>
                <ProgressBar value={row.max ? (row.used / (row.remaining ? Math.max(row.max, row.used) : row.max)) * 100 : 0} tone={!row.remaining && row.used >= row.max ? "warning" : "accent"} />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(plans.data ?? []).map((plan, index) => {
          const isCurrent = plan.code === salon.plan_code;
          const highlight = plan.code === "pro";
          return (
            <motion.div key={plan.code} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
              <Card className={cn("relative flex h-full flex-col p-6", isCurrent && "border-accent shadow-glow", highlight && !isCurrent && "border-accent/40")}>
                {highlight && <Badge tone="accent" className="absolute right-4 top-4"><Sparkles className="h-3 w-3" /> Nejoblíbenější</Badge>}
                <p className="text-sm font-semibold uppercase tracking-wider text-fg-muted">{plan.name}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight tabular">
                  {plan.price_monthly === 0 ? "0 Kč" : czk(plan.price_monthly)}
                  <span className="text-sm font-normal text-fg-subtle"> / měsíc</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-success" /> {plan.limits.staff >= 999 ? "Neomezeně pracovníků" : `${plan.limits.staff} ${plan.limits.staff === 1 ? "pracovník" : plan.limits.staff < 5 ? "pracovníci" : "pracovníků"}`}
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-success" /> {plan.limits.locations >= 99 ? "Neomezeně poboček" : `${plan.limits.locations} ${plan.limits.locations === 1 ? "pobočka" : "pobočky"}`}
                  </li>
                  {plan.limits.sms_included > 0 && (
                    <li className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-success" /> {plan.limits.sms_included} SMS měsíčně
                    </li>
                  )}
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-success" /> Online rezervace 24/7, klienti, e-mail a push
                  </li>
                  {plan.limits.features.filter((feature) => feature !== "inventory").map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-success" /> {featureLabels[feature] ?? feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid gap-2">
                  {isCurrent ? (
                    <Badge tone="success" className="justify-center py-2">Váš aktuální tarif</Badge>
                  ) : (
                    isOwner && (
                      <>
                        <Button variant={highlight ? "primary" : "secondary"} loading={busy === plan.code} onClick={() => choose(plan)}>
                          {(current?.sort ?? 0) < plan.sort ? "Přejít na" : "Změnit na"} {plan.name}
                        </Button>
                        {dev && (
                          <Button variant="ghost" size="sm" onClick={() => devSwitch(plan)}>
                            Přepnout hned (jen vývoj)
                          </Button>
                        )}
                      </>
                    )
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <p className="text-center text-xs text-fg-subtle">Žádná provize z rezervací. Ceny jsou uvedeny včetně DPH. Ověřovací SMS při přihlášení platíme my.</p>
    </div>
  );
}
