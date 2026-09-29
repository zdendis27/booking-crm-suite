"use client";

import { paymentMethod } from "@repo/copy";
import { Avatar, Badge, Button, Card, CardHeader, Dialog, Donut, EmptyState, Field, Input, Select, Skeleton, Spinner, chartColors, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Coins, Lock, ShoppingBag, Store, Unlock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { errorMessage, useServices, useSb, useStaff } from "@/lib/data";
import { formatDateTime, formatTime, todayLocal } from "@/lib/time";
import type { Snapshot } from "@/lib/types";
import { priceFor } from "@/components/calendar/booking-form";

export function CashPage() {
  return (
    <FeatureGate feature="finance">
      <CashContent />
    </FeatureGate>
  );
}

function CashContent() {
  const { salon, locationId } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayLocal(salon.timezone);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [float, setFloat] = useState("2000");
  const [counted, setCounted] = useState("");

  const session = useQuery({
    queryKey: ["cash", "session", locationId],
    queryFn: async () => {
      const { data } = await sb.from("cash_register_sessions").select("*").eq("location_id", locationId).order("opened_at", { ascending: false }).limit(8);
      const rows = (data ?? []) as any[];
      const open = rows.find((r) => !r.closed_at) ?? null;
      let cash = 0;
      if (open) {
        const { data: pay } = await sb.from("payments").select("amount").eq("cash_session_id", open.id).eq("method", "cash").eq("status", "succeeded");
        cash = ((pay ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount), 0);
      }
      return { open, cash, history: rows.filter((r) => r.closed_at) };
    },
  });

  const snapshot = useQuery({
    queryKey: ["cash", "snapshot", salon.id, today],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("owner_snapshot", { p_salon: salon.id, p_from: today, p_to: today });
      if (error) throw error;
      return data as Snapshot;
    },
  });

  const payments = useQuery({
    queryKey: ["cash", "payments", locationId, today],
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date(`${today}T00:00:00`);
      const { data } = await sb
        .from("payments")
        .select("id,kind,method,amount,paid_at,clients(full_name)")
        .eq("salon_id", salon.id)
        .eq("status", "succeeded")
        .gte("paid_at", new Date(start.getTime() - 3 * 3600000).toISOString())
        .order("paid_at", { ascending: false })
        .limit(50);
      return ((data ?? []) as any[]).filter((p) => new Date(p.paid_at).toLocaleDateString("sv-SE", { timeZone: salon.timezone }) === today);
    },
  });

  const open = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("open_cash_session", { p_location: locationId, p_float: Math.round(Number(float.replace(",", ".")) * 100) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Směna otevřena");
      setOpenDialog(false);
      qc.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (error) => toast.error("Směnu se nepodařilo otevřít", errorMessage(error)),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("close_cash_session", { p_session: session.data!.open.id, p_counted: Math.round(Number(counted.replace(",", ".")) * 100), p_note: null });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: (diff) => {
      toast[diff === 0 ? "success" : "warning"](diff === 0 ? "Směna uzavřena, pokladna sedí" : `Směna uzavřena, rozdíl ${czk(diff)}`);
      setCloseDialog(false);
      setCounted("");
      qc.invalidateQueries({ queryKey: ["cash"] });
    },
    onError: (error) => toast.error("Směnu se nepodařilo uzavřít", errorMessage(error)),
  });

  const s = session.data;
  const expected = s?.open ? Number(s.open.opening_float) + s.cash : 0;
  const methods = Object.entries(snapshot.data?.revenue.by_method ?? {}).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title="Pokladna"
        description="Dnešní tržby, pokladní směna a rychlý prodej."
        actions={
          <Button size="lg" onClick={() => setSaleOpen(true)} leading={<ShoppingBag className="h-[18px] w-[18px]" />}>
            Rychlý prodej
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-1">
          {session.isLoading ? (
            <Skeleton className="m-5 h-44" />
          ) : s?.open ? (
            <>
              <div className="bg-[image:var(--gradient-brand)] p-6 text-white">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-white/90">
                    <Unlock className="h-4 w-4" /> Směna je otevřená
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">od {formatTime(s.open.opened_at, salon.timezone)}</span>
                </div>
                <p className="mt-4 text-sm text-white/80">V pokladně má být</p>
                <p className="text-4xl font-semibold tracking-tight tabular">{czk(expected)}</p>
                <p className="mt-2 text-sm text-white/75">
                  Počáteční stav {czk(s.open.opening_float)} + hotovost {czk(s.cash)}
                </p>
              </div>
              <div className="p-4">
                <Button variant="secondary" className="w-full" onClick={() => setCloseDialog(true)} leading={<Lock className="h-4 w-4" />}>
                  Uzavřít směnu
                </Button>
              </div>
            </>
          ) : (
            <EmptyState icon={Coins} compact title="Směna není otevřená" description="Otevřete směnu, aby se hotovostní platby zapisovaly do pokladny." action={<Button onClick={() => setOpenDialog(true)} leading={<Unlock className="h-4 w-4" />}>Otevřít směnu</Button>} />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Tržby dnes" description="Podle způsobu platby" />
          <div className="flex flex-col items-center gap-6 p-5 sm:flex-row">
            <Donut
              data={methods.map(([m, v], i) => ({ label: paymentMethod[m] ?? m, value: Math.max(0, v), color: chartColors[i % chartColors.length]! }))}
              center={
                <>
                  <span className="text-xs text-fg-subtle">Celkem</span>
                  <span className="text-xl font-semibold tabular">{czk(snapshot.data?.revenue.received ?? 0)}</span>
                </>
              }
            />
            <div className="w-full space-y-3">
              {snapshot.isLoading && <Spinner />}
              {methods.length === 0 && !snapshot.isLoading && <p className="text-sm text-fg-muted">Dnes zatím žádné platby.</p>}
              {methods.map(([m, v], i) => (
                <div key={m} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-sm">
                    <span className="h-3 w-3 rounded-full" style={{ background: chartColors[i % chartColors.length] }} />
                    {paymentMethod[m] ?? m}
                  </span>
                  <span className="font-semibold tabular">{czk(v)}</span>
                </div>
              ))}
              {(snapshot.data?.revenue.tips ?? 0) > 0 && (
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-fg-muted">
                  <span>Spropitné</span>
                  <span className="font-semibold tabular">{czk(snapshot.data!.revenue.tips)}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Dnešní platby" description={`${payments.data?.length ?? 0} záznamů`} />
        <ul className="divide-y divide-border p-2">
          {payments.isLoading && <li className="p-4"><Spinner /></li>}
          {!payments.isLoading && (payments.data ?? []).length === 0 && <li className="p-6 text-center text-sm text-fg-muted">Zatím žádné platby.</li>}
          {(payments.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-3">
              <Avatar name={p.clients?.full_name ?? "Prodej"} size={34} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium">{p.clients?.full_name ?? "Bez klienta"}</span>
                <span className="text-xs text-fg-subtle">{formatDateTime(p.paid_at, salon.timezone)}</span>
              </span>
              <Badge tone={p.method === "cash" ? "success" : p.method === "card" ? "accent" : "info"}>{paymentMethod[p.method]}</Badge>
              {p.kind === "tip" && <Badge tone="pink">Spropitné</Badge>}
              <span className={cn("w-24 text-right font-semibold tabular", p.amount < 0 && "text-danger")}>{czk(p.amount)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {(s?.history ?? []).length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Uzavřené směny" />
          <ul className="divide-y divide-border p-2">
            {(s?.history ?? []).map((row: any) => {
              const diff = Number(row.counted_cash) - Number(row.expected_cash);
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{formatDateTime(row.closed_at, salon.timezone)}</span>
                    <span className="text-xs text-fg-subtle">Očekáváno {czk(row.expected_cash)}, napočítáno {czk(row.counted_cash)}</span>
                  </span>
                  <Badge tone={diff === 0 ? "success" : diff > 0 ? "info" : "danger"}>{diff === 0 ? "Sedí" : `${diff > 0 ? "+" : ""}${czk(diff)}`}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Dialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        title="Otevřít pokladní směnu"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>
              Zrušit
            </Button>
            <Button loading={open.isPending} onClick={() => open.mutate()}>
              Otevřít
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field label="Počáteční stav pokladny (Kč)" hint="Drobné v pokladně na začátku směny">
            <Input inputMode="decimal" value={float} onChange={(event) => setFloat(event.target.value)} inputSize="lg" autoFocus />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        title="Uzavřít směnu"
        description={`V pokladně má být ${czk(expected)}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseDialog(false)}>
              Zrušit
            </Button>
            <Button loading={close.isPending} disabled={!counted} onClick={() => close.mutate()}>
              Uzavřít směnu
            </Button>
          </>
        }
      >
        <div className="grid gap-3 pb-2">
          <Field label="Napočítaná hotovost (Kč)">
            <Input inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} inputSize="lg" autoFocus />
          </Field>
          {counted && (
            <p className={cn("rounded-md px-3 py-2 text-sm", Math.round(Number(counted.replace(",", ".")) * 100) === expected ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              Rozdíl: {czk(Math.round(Number(counted.replace(",", ".")) * 100) - expected)}
            </p>
          )}
        </div>
      </Dialog>

      <QuickSale open={saleOpen} onOpenChange={setSaleOpen} />
      <p className="mt-6 text-center text-xs text-fg-subtle">
        Kompletní přehledy najdete ve <Link href={`/app/${salon.slug}/finance`} className="text-accent">Financích</Link>.
      </p>
    </div>
  );
}

function QuickSale({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon, locationId, staffId: ownStaff } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const services = useServices();
  const staffQuery = useStaff();
  const staff = useMemo(() => (staffQuery.data ?? []).filter((s) => s.bookable && s.locations.includes(locationId)), [staffQuery.data, locationId]);
  const [staffId, setStaffId] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState("card");
  const [tip, setTip] = useState("");
  const activeStaff = staffId || ownStaff || staff[0]?.id || "";
  const staffRow = staff.find((s) => s.id === activeStaff);

  const serviceList = (services.data?.services ?? []).filter((s) => staffRow?.services[s.id]);
  const servicesTotal = chosen.reduce((sum, id) => {
    const service = services.data?.services.find((s) => s.id === id);
    return service ? sum + priceFor(service, staffRow).price : sum;
  }, 0);
  const total = servicesTotal;

  const sell = useMutation({
    mutationFn: async () => {
      let clientId = (await sb.from("clients").select("id").eq("salon_id", salon.id).eq("first_name", "Anonymní").eq("last_name", "zákazník").is("merged_into", null).maybeSingle()).data?.id as string | undefined;
      if (!clientId) {
        const { data, error } = await sb.from("clients").insert({ salon_id: salon.id, first_name: "Anonymní", last_name: "zákazník", source: "pokladna" }).select("id").single();
        if (error) throw error;
        clientId = (data as { id: string }).id;
      }
      const start = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
      const items = chosen.map((service_id) => ({ service_id, staff_id: activeStaff }));
      if (items.length === 0) throw new Error("Vyberte alespoň jednu službu.");
      const { data: booking, error } = await sb.rpc("admin_create_booking", { p_location: locationId, p_client: clientId, p_items: items, p_starts_at: start, p_source: "walk_in", p_client_note: null, p_internal_note: "Rychlý prodej", p_status: "confirmed" });
      if (error) throw error;
      const done = await sb.rpc("set_booking_status", { p_booking: booking, p_status: "completed", p_reason: null });
      if (done.error) throw done.error;
      const tipHalere = tip ? Math.round(Number(tip.replace(",", ".")) * 100) : 0;
      if (total > 0) {
        const pay = await sb.rpc("record_payment", { p_booking: booking, p_amount: total, p_method: method, p_tip: tipHalere, p_note: null });
        if (pay.error) throw pay.error;
      }
    },
    onSuccess: () => {
      toast.success("Prodej zapsán", czk(total));
      onOpenChange(false);
      setChosen([]);
      setTip("");
      qc.invalidateQueries();
    },
    onError: (error) => toast.error("Prodej se nepodařilo zapsat", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Rychlý prodej"
      description="Klient bez objednání: služby a zboží se zapíšou a rovnou uhradí."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button size="lg" loading={sell.isPending} disabled={chosen.length === 0} onClick={() => sell.mutate()} leading={<Banknote className="h-4 w-4" />}>
            Zaplaceno {czk(total)}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 pb-2">
        <Field label="Pracovník">
          <Select value={activeStaff} onChange={(event) => { setStaffId(event.target.value); setChosen([]); }}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">Služby</p>
          <div className="flex flex-wrap gap-2">
            {serviceList.map((service) => {
              const on = chosen.includes(service.id);
              return (
                <button key={service.id} type="button" onClick={() => setChosen(on ? chosen.filter((id) => id !== service.id) : [...chosen, service.id])} className={cn("rounded-md border px-3 py-2 text-left text-sm transition-all", on ? "border-accent bg-accent-soft text-accent" : "border-border hover:border-border-strong")}>
                  <span className="block font-medium">{service.name}</span>
                  <span className="text-xs opacity-70">{czk(priceFor(service, staffRow).price)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Způsob platby">
            <Select value={method} onChange={(event) => setMethod(event.target.value)}>
              {["card", "cash", "qr", "bank_transfer", "other"].map((m) => (
                <option key={m} value={m}>
                  {paymentMethod[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Spropitné (Kč)">
            <Input inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0" />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-md bg-[image:var(--gradient-soft)] p-4">
          <span className="flex items-center gap-2 text-fg-muted">
            <Store className="h-4 w-4" /> K úhradě
          </span>
          <span className="text-2xl font-semibold tabular">{czk(total)}</span>
        </div>
      </div>
    </Dialog>
  );
}
