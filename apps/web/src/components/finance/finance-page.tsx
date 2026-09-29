"use client";

import { expenseCategories, paymentMethod } from "@repo/copy";
import { AreaChart, BarChart, Badge, Button, Card, CardHeader, Dialog, Donut, EmptyState, Field, Input, Select, Skeleton, Stagger, StaggerItem, Tabs, addDays, addMonths, chartColors, cn, formatMonth, startOfMonth, todayISO, useToast, DatePicker } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Plus, Receipt, Trash2, TrendingUp, Wallet, PiggyBank, Coins, CircleDollarSign } from "lucide-react";
import { useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { Delta, StatCard } from "@/components/app/stat-card";
import { DataTable, type Column } from "@/components/app/data-table";
import { downloadCsv, halereToCsv } from "@/lib/csv";
import { czk, czkShort } from "@/lib/format";
import { errorMessage, useSb } from "@/lib/data";
import { dayBoundsISO, formatDateTime } from "@/lib/time";
import type { Snapshot } from "@/lib/types";

export function FinancePage() {
  return (
    <FeatureGate feature="finance">
      <FinanceContent />
    </FeatureGate>
  );
}

const lastDay = (monthStart: string) => addDays(addMonths(monthStart, 1), -1);

function FinanceContent() {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayISO(salon.timezone);
  const [month, setMonth] = useState(startOfMonth(today));
  const [tab, setTab] = useState<"payments" | "expenses">("payments");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const previous = addMonths(month, -1);

  const useMonthSnapshot = (start: string) =>
    useQuery({
      queryKey: ["finance", "snapshot", salon.id, start],
      queryFn: async () => {
        const { data, error } = await sb.rpc("owner_snapshot", { p_salon: salon.id, p_from: start, p_to: lastDay(start) });
        if (error) throw error;
        return data as Snapshot;
      },
    });
  const cur = useMonthSnapshot(month);
  const prev = useMonthSnapshot(previous);

  const overview = useQuery({
    queryKey: ["finance", "overview", salon.id, startOfMonth(today)],
    queryFn: async () => {
      const months = Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(today), i - 5));
      const results = await Promise.all(months.map((start) => sb.rpc("owner_snapshot", { p_salon: salon.id, p_from: start, p_to: lastDay(start) })));
      return months.map((start, i) => ({ start, snap: results[i]!.data as Snapshot }));
    },
  });

  const payments = useQuery({
    queryKey: ["finance", "payments", salon.id, month],
    queryFn: async () => {
      const { data, error } = await sb
        .from("payments")
        .select("id,kind,method,amount,paid_at,note,clients(full_name)")
        .eq("salon_id", salon.id)
        .eq("status", "succeeded")
        .gte("paid_at", dayBoundsISO(month, salon.timezone).from)
        .lt("paid_at", dayBoundsISO(addDays(lastDay(month), 0), salon.timezone).to)
        .order("paid_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const expenses = useQuery({
    queryKey: ["finance", "expenses", salon.id, month],
    queryFn: async () => {
      const { data, error } = await sb.from("expenses").select("*").eq("salon_id", salon.id).gte("incurred_on", month).lte("incurred_on", lastDay(month)).order("incurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const removeExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
    onError: (error) => toast.error("Výdaj se nepodařilo smazat", errorMessage(error)),
  });

  const c = cur.data;
  const p = prev.data;
  const expensesTotal = c?.expenses?.total ?? 0;
  const profit = (c?.revenue.received ?? 0) - expensesTotal;
  const methods = Object.entries(c?.revenue.by_method ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const isCurrent = month === startOfMonth(today);

  const paymentColumns: Column<any>[] = [
    { key: "date", header: "Datum", cell: (row) => <span className="tabular">{formatDateTime(row.paid_at, salon.timezone)}</span> },
    { key: "client", header: "Klient", cell: (row) => row.clients?.full_name ?? <span className="text-fg-subtle">Bez klienta</span> },
    { key: "method", header: "Způsob", hide: "sm", cell: (row) => <Badge tone={row.method === "cash" ? "success" : row.method === "card" ? "accent" : "info"}>{paymentMethod[row.method]}</Badge> },
    { key: "kind", header: "Typ", hide: "md", cell: (row) => (row.kind === "tip" ? "Spropitné" : row.kind === "refund" ? "Vrácení" : row.kind === "deposit" ? "Záloha" : "Platba") },
    { key: "amount", header: "Částka", align: "right", cell: (row) => <span className={cn("font-semibold", row.amount < 0 && "text-danger")}>{czk(row.amount)}</span> },
  ];

  const expenseColumns: Column<any>[] = [
    { key: "date", header: "Datum", cell: (row) => new Date(row.incurred_on).toLocaleDateString("cs-CZ") },
    { key: "desc", header: "Popis", cell: (row) => <span className="font-medium">{row.description}</span> },
    { key: "cat", header: "Kategorie", hide: "sm", cell: (row) => <Badge>{expenseCategories[row.category] ?? row.category}</Badge> },
    { key: "method", header: "Způsob", hide: "md", cell: (row) => paymentMethod[row.method] },
    { key: "amount", header: "Částka", align: "right", cell: (row) => <span className="font-semibold">{czk(row.amount)}</span> },
    {
      key: "del",
      header: "",
      align: "right",
      cell: (row) => (
        <button type="button" onClick={() => removeExpense.mutate(row.id)} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Tržby, náklady a zisk. Čísla jsou počítána z plateb a výdajů, které v systému zapíšete."
        actions={
          <>
            <Button
              variant="secondary"
              leading={<Download className="h-4 w-4" />}
              onClick={() =>
                downloadCsv(`platby-${month.slice(0, 7)}.csv`, [
                  ["Datum", "Klient", "Způsob", "Typ", "Částka (Kč)"],
                  ...(payments.data ?? []).map((r) => [r.paid_at.slice(0, 10), r.clients?.full_name ?? "", paymentMethod[r.method], r.kind, halereToCsv(r.amount)]),
                ])
              }
            >
              Export plateb
            </Button>
            <Button onClick={() => setExpenseOpen(true)} leading={<Plus className="h-4 w-4" />}>
              Nový výdaj
            </Button>
          </>
        }
      />

      <div className="mb-6 flex items-center gap-1 self-start rounded-md border border-border bg-surface p-1 shadow-xs sm:inline-flex">
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Předchozí měsíc">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-semibold capitalize">{formatMonth(month)}</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))} disabled={isCurrent} aria-label="Další měsíc">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={TrendingUp} label="Tržby" value={(c?.revenue.received ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} loading={cur.isLoading} tone="success" delta={c && p ? <Delta current={c.revenue.received} previous={p.revenue.received} /> : undefined} spark={c?.daily.map((d) => d.received)} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Receipt} label="Náklady" value={expensesTotal / 100} format={(n) => czk(Math.round(n * 100))} loading={cur.isLoading} tone="warning" delta={c?.expenses && p?.expenses ? <Delta current={c.expenses.total} previous={p.expenses.total} inverse /> : undefined} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={PiggyBank} label="Hrubý zisk" value={profit / 100} format={(n) => czk(Math.round(n * 100))} loading={cur.isLoading} tone="accent" delta={c && p ? <Delta current={profit} previous={p.revenue.received - (p.expenses?.total ?? 0)} /> : undefined} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Coins} label="Spropitné" value={(c?.revenue.tips ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} loading={cur.isLoading} tone="pink" />
        </StaggerItem>
      </Stagger>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Denní tržby" description="Tento měsíc oproti předchozímu" />
          <div className="p-3 pt-1 sm:p-5">
            <AreaChart
              height={260}
              labels={(c?.daily ?? []).map((d) => `${Number(d.day.slice(8))}.`)}
              format={(n) => czkShort(n * 100)}
              series={[
                { name: "Tento měsíc", color: "var(--chart-1)", values: (c?.daily ?? []).map((d) => d.received / 100) },
                { name: "Předchozí měsíc", color: "var(--chart-4)", dashed: true, values: (p?.daily ?? []).slice(0, c?.daily.length ?? 0).map((d) => d.received / 100) },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Způsoby platby" />
          <div className="flex flex-col items-center gap-5 p-5">
            <Donut data={methods.map(([m, v], i) => ({ label: paymentMethod[m] ?? m, value: v, color: chartColors[i % chartColors.length]! }))} center={<span className="text-lg font-semibold tabular">{czkShort(c?.revenue.received ?? 0)}</span>} />
            <ul className="w-full space-y-2.5">
              {methods.map(([m, v], i) => (
                <li key={m} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[i % chartColors.length] }} />
                    {paymentMethod[m] ?? m}
                  </span>
                  <span className="font-semibold tabular">{czk(v)}</span>
                </li>
              ))}
              {methods.length === 0 && <li className="text-center text-sm text-fg-subtle">Žádné platby.</li>}
            </ul>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Posledních 6 měsíců" description="Tržby a náklady" />
        <div className="p-3 sm:p-5">
          {overview.isLoading ? (
            <Skeleton className="h-60" />
          ) : (
            <BarChart
              height={240}
              labels={(overview.data ?? []).map((m) => new Intl.DateTimeFormat("cs-CZ", { month: "short", timeZone: "UTC" }).format(new Date(`${m.start}T00:00:00Z`)))}
              format={(n) => czkShort(n * 100)}
              series={[
                { name: "Tržby", color: "var(--chart-2)", values: (overview.data ?? []).map((m) => m.snap.revenue.received / 100) },
                { name: "Náklady", color: "var(--chart-3)", values: (overview.data ?? []).map((m) => (m.snap.expenses?.total ?? 0) / 100) },
              ]}
            />
          )}
        </div>
      </Card>

      <div className="mt-8">
        <Tabs
          value={tab}
          onChange={setTab}
          className="mb-4"
          tabs={[
            { value: "payments", label: "Platby", count: payments.data?.length },
            { value: "expenses", label: "Výdaje", count: expenses.data?.length },
          ]}
        />
        {tab === "payments" ? (
          <DataTable columns={paymentColumns} rows={payments.data ?? []} getKey={(row) => row.id} loading={payments.isLoading} empty={<EmptyState icon={Wallet} title="V tomto měsíci nejsou žádné platby" />} />
        ) : (
          <DataTable columns={expenseColumns} rows={expenses.data ?? []} getKey={(row) => row.id} loading={expenses.isLoading} empty={<EmptyState icon={CircleDollarSign} title="Žádné výdaje" description="Zapište nájem, energie nebo nákup zboží a uvidíte skutečný zisk." action={<Button onClick={() => setExpenseOpen(true)}>Přidat výdaj</Button>} />} />
        )}
      </div>

      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
    </div>
  );
}

function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { salon, locationId } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState("najem");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState<string | null>(todayISO(salon.timezone));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("expenses").insert({
        salon_id: salon.id,
        location_id: locationId,
        category,
        description: description.trim(),
        amount: Math.round(Number(amount.replace(",", ".")) * 100),
        vat_amount: vat ? Math.round(Number(vat.replace(",", ".")) * 100) : 0,
        method,
        incurred_on: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Výdaj zapsán");
      setDescription("");
      setAmount("");
      setVat("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["snapshot"] });
    },
    onError: (error) => toast.error("Výdaj se nepodařilo zapsat", errorMessage(error)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nový výdaj"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button loading={save.isPending} disabled={!description.trim() || !amount || Number(amount.replace(",", ".")) <= 0} onClick={() => save.mutate()}>
            Zapsat výdaj
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Field label="Kategorie">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(expenseCategories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Popis" required>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Např. Nájem provozovny" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Částka (Kč)" required>
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="z toho DPH (Kč)">
            <Input inputMode="decimal" value={vat} onChange={(event) => setVat(event.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <DatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Způsob úhrady">
            <Select value={method} onChange={(event) => setMethod(event.target.value)}>
              {["bank_transfer", "card", "cash", "other"].map((value) => (
                <option key={value} value={value}>
                  {paymentMethod[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
