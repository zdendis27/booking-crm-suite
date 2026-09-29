"use client";

import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Select, Skeleton, Stagger, StaggerItem, Switch, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Gift, Percent, Save, Sparkles, Star, Ticket, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { StatCard } from "@/components/app/stat-card";
import { czk } from "@/lib/format";
import { errorMessage, useServices, useSb } from "@/lib/data";

interface Program {
  id?: string;
  name: string;
  active: boolean;
  threshold: number;
  reward_type: "free_service" | "percent_discount" | "fixed_discount";
  reward_service_id: string | null;
  reward_value: number | null;
  reward_scope_service_ids: string[] | null;
  stamp_valid_months: number | null;
  reward_valid_months: number | null;
}

const defaults: Program = { name: "Věrnostní karta", active: true, threshold: 5, reward_type: "free_service", reward_service_id: null, reward_value: null, reward_scope_service_ids: null, stamp_valid_months: null, reward_valid_months: 12 };

export function LoyaltyPage() {
  return (
    <FeatureGate feature="loyalty">
      <LoyaltyContent />
    </FeatureGate>
  );
}

function LoyaltyContent() {
  const { salon, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const services = useServices();
  const editable = can(["owner", "manager"]);
  const [draft, setDraft] = useState<Program>(defaults);
  const [percentInput, setPercentInput] = useState("10");
  const [fixedInput, setFixedInput] = useState("100");

  const program = useQuery({
    queryKey: ["loyalty-program", salon.id],
    queryFn: async () => {
      const { data } = await sb.from("loyalty_programs").select("*").eq("salon_id", salon.id).eq("active", true).maybeSingle();
      return data as (Program & { id: string }) | null;
    },
  });

  useEffect(() => {
    if (program.data) {
      setDraft(program.data);
      if (program.data.reward_type === "percent_discount") setPercentInput(String(program.data.reward_value ?? 10));
      if (program.data.reward_type === "fixed_discount") setFixedInput(String((program.data.reward_value ?? 10000) / 100));
    } else if (program.isFetched && services.data && !draft.reward_service_id) {
      setDraft((current) => ({ ...current, reward_service_id: services.data!.services[0]?.id ?? null }));
    }
  }, [program.data, program.isFetched, services.data]);

  const stats = useQuery({
    queryKey: ["loyalty-stats", salon.id, program.data?.id],
    enabled: !!program.data,
    queryFn: async () => {
      const [rewards, events] = await Promise.all([
        sb.from("loyalty_rewards").select("id,status").eq("salon_id", salon.id),
        sb.from("loyalty_events").select("client_id,type,reversed_at,reward_id").eq("salon_id", salon.id).eq("type", "stamp_earned").is("reversed_at", null).is("reward_id", null).limit(3000),
      ]);
      const counts = new Map<string, number>();
      for (const event of events.data ?? []) counts.set(event.client_id as string, (counts.get(event.client_id as string) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      const names = top.length ? await sb.from("clients").select("id,full_name").in("id", top.map(([id]) => id)) : { data: [] };
      const nameMap = new Map(((names.data ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]));
      const r = (rewards.data ?? []) as { status: string }[];
      return {
        cards: counts.size,
        earned: r.length,
        available: r.filter((x) => x.status === "available").length,
        redeemed: r.filter((x) => x.status === "redeemed").length,
        top: top.map(([id, count]) => ({ id, count, name: nameMap.get(id) ?? "Klient" })),
      };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      let value: number | null = null;
      if (draft.reward_type === "percent_discount") value = Math.max(1, Math.min(100, Math.round(Number(percentInput))));
      if (draft.reward_type === "fixed_discount") value = Math.round(Number(fixedInput.replace(",", ".")) * 100);
      const payload = {
        name: draft.name.trim() || "Věrnostní karta",
        threshold: draft.threshold,
        reward_type: draft.reward_type,
        reward_service_id: draft.reward_type === "free_service" ? draft.reward_service_id : null,
        reward_value: value,
        reward_scope_service_ids: draft.reward_type === "free_service" ? null : draft.reward_scope_service_ids,
        stamp_valid_months: draft.stamp_valid_months,
        reward_valid_months: draft.reward_valid_months,
        active: draft.active,
      };
      if (program.data?.id) {
        const { error } = await sb.from("loyalty_programs").update(payload).eq("id", program.data.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("loyalty_programs").insert({ ...payload, salon_id: salon.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Věrnostní program uložen");
      qc.invalidateQueries({ queryKey: ["loyalty-program"] });
    },
    onError: (error) => toast.error("Program se nepodařilo uložit", errorMessage(error)),
  });

  const serviceName = services.data?.services.find((s) => s.id === draft.reward_service_id)?.name ?? "službu";
  const rewardLabel = draft.reward_type === "free_service" ? `${serviceName} zdarma` : draft.reward_type === "percent_discount" ? `Sleva ${percentInput || 0} %` : `Sleva ${czk(Math.round(Number(fixedInput.replace(",", ".") || 0) * 100))}`;
  const monthsOptions = [{ v: "", l: "Bez omezení" }, { v: "6", l: "6 měsíců" }, { v: "12", l: "12 měsíců" }, { v: "24", l: "24 měsíců" }];

  if (program.isLoading) return <Skeleton className="h-96 rounded-lg" />;

  return (
    <div>
      <PageHeader
        title="Věrnostní program"
        description="Odměňte pravidelné klienty. Razítka se přidávají automaticky po každé proběhlé návštěvě, odměnu uplatní pracovník u rezervace."
        actions={
          editable && (
            <Button size="lg" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-[18px] w-[18px]" />}>
              {program.data ? "Uložit změny" : "Zapnout program"}
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Pravidla" description="Například „5 návštěv a šestá zdarma“" />
            <div className="grid gap-5 p-5">
              <Field label="Název programu">
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!editable} />
              </Field>
              <Field label={`Počet návštěv do odměny: ${draft.threshold}`}>
                <input type="range" min={2} max={15} value={draft.threshold} disabled={!editable} onChange={(event) => setDraft({ ...draft, threshold: Number(event.target.value) })} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--accent)]" />
                <div className="flex justify-between text-xs text-fg-subtle">
                  <span>2</span>
                  <span>15</span>
                </div>
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium">Odměna</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { value: "free_service", label: "Služba zdarma", icon: Gift },
                    { value: "percent_discount", label: "Procentní sleva", icon: Percent },
                    { value: "fixed_discount", label: "Sleva v Kč", icon: Ticket },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      disabled={!editable}
                      onClick={() => setDraft({ ...draft, reward_type: item.value as Program["reward_type"] })}
                      className={cn("flex flex-col items-center gap-2 rounded-md border p-4 text-sm font-medium transition-all", draft.reward_type === item.value ? "border-accent bg-accent-soft text-accent shadow-sm" : "border-border hover:border-border-strong")}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {draft.reward_type === "free_service" && (
                <Field label="Která služba je zdarma">
                  <Select value={draft.reward_service_id ?? ""} disabled={!editable} onChange={(event) => setDraft({ ...draft, reward_service_id: event.target.value })}>
                    {(services.data?.services ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {draft.reward_type === "percent_discount" && (
                <Field label="Sleva (%)">
                  <Input type="number" min={1} max={100} value={percentInput} disabled={!editable} onChange={(event) => setPercentInput(event.target.value)} />
                </Field>
              )}
              {draft.reward_type === "fixed_discount" && (
                <Field label="Sleva (Kč)">
                  <Input inputMode="decimal" value={fixedInput} disabled={!editable} onChange={(event) => setFixedInput(event.target.value)} />
                </Field>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platnost razítek" hint="Po uplynutí se razítka přestanou počítat">
                  <Select value={draft.stamp_valid_months?.toString() ?? ""} disabled={!editable} onChange={(event) => setDraft({ ...draft, stamp_valid_months: event.target.value ? Number(event.target.value) : null })}>
                    {monthsOptions.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Platnost odměny">
                  <Select value={draft.reward_valid_months?.toString() ?? ""} disabled={!editable} onChange={(event) => setDraft({ ...draft, reward_valid_months: event.target.value ? Number(event.target.value) : null })}>
                    {monthsOptions.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Program je aktivní</p>
                  <p className="text-xs text-fg-muted">Vypnutím se přestanou přidávat nová razítka</p>
                </div>
                <Switch checked={draft.active} onCheckedChange={(value) => setDraft({ ...draft, active: value })} disabled={!editable} label="Aktivní" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Náhled karty zákazníka</p>
            <motion.div layout className="relative overflow-hidden rounded-xl bg-[image:var(--gradient-brand)] p-6 text-white shadow-glow">
              <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-black/10" />
              <div className="relative">
                <p className="text-sm font-medium text-white/80">{salon.name}</p>
                <p className="mt-0.5 text-xl font-semibold">{draft.name || "Věrnostní karta"}</p>
                <div className="mt-5 grid grid-cols-5 gap-2.5 sm:grid-cols-8">
                  {Array.from({ length: draft.threshold }, (_, index) => (
                    <motion.span key={index} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("flex aspect-square items-center justify-center rounded-full border-2", index < Math.min(3, draft.threshold - 1) ? "border-white bg-white text-accent" : "border-white/40")}>
                      {index < Math.min(3, draft.threshold - 1) ? <Star className="h-4 w-4 fill-current" /> : <span className="text-xs text-white/60">{index + 1}</span>}
                    </motion.span>
                  ))}
                </div>
                <div className="mt-5 flex items-center justify-between rounded-lg bg-white/15 px-4 py-3 backdrop-blur">
                  <span className="text-sm text-white/85">Po {draft.threshold} návštěvách</span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Gift className="h-4 w-4" /> {rewardLabel}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {program.data && (
            <Stagger className="grid grid-cols-2 gap-3">
              <StaggerItem>
                <StatCard icon={Users} label="Klientů se razítky" value={stats.data?.cards ?? 0} tone="accent" loading={stats.isLoading} />
              </StaggerItem>
              <StaggerItem>
                <StatCard icon={Trophy} label="Získaných odměn" value={stats.data?.earned ?? 0} tone="pink" loading={stats.isLoading} />
              </StaggerItem>
              <StaggerItem>
                <StatCard icon={Sparkles} label="Čeká na uplatnění" value={stats.data?.available ?? 0} tone="warning" loading={stats.isLoading} />
              </StaggerItem>
              <StaggerItem>
                <StatCard icon={Gift} label="Uplatněno" value={stats.data?.redeemed ?? 0} tone="success" loading={stats.isLoading} />
              </StaggerItem>
            </Stagger>
          )}

          {program.data && (
            <Card>
              <CardHeader title="Nejblíže odměně" />
              <ul className="divide-y divide-border p-2">
                {(stats.data?.top ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím nikdo nemá razítka.</li>}
                {(stats.data?.top ?? []).map((row) => (
                  <li key={row.id}>
                    <Link href={`/app/${salon.slug}/klienti/${row.id}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2">
                      <Avatar name={row.name} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
                      <Badge tone="accent">{row.count} / {program.data!.threshold}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
