"use client";

import { automationTypes, bookingStatus, expenseCategories, paymentMethod, weekdayShort } from "@repo/copy";
import {
  AnimatedNumber,
  AreaChart,
  Avatar,
  BarChart,
  Badge,
  Button,
  Card,
  CardHeader,
  Donut,
  EmptyState,
  ProgressBar,
  ProgressRing,
  Skeleton,
  Stagger,
  StaggerItem,
  addDays,
  addMonths,
  chartColors,
  startOfMonth,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  CalendarCheck,
  CalendarPlus,
  CreditCard,
  Gift,
  Receipt,
  Repeat,
  Sparkles,
  TrendingUp,
  UserPlus,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { Delta, SectionHeading, StatCard } from "@/components/app/stat-card";
import { czk, czkShort, percent } from "@/lib/format";
import { getSupabase } from "@/lib/supabase/client";
import { formatTime, todayLocal, toLocal } from "@/lib/time";
import type { Snapshot } from "@/lib/types";

function greeting(hour: number) {
  if (hour < 5) return "Dobrou noc";
  if (hour < 10) return "Dobré ráno";
  if (hour < 18) return "Dobrý den";
  return "Dobrý večer";
}

function useSnapshot(from: string, to: string, enabled = true) {
  const { salon } = useSalon();
  return useQuery({
    queryKey: ["snapshot", salon.id, from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("owner_snapshot", { p_salon: salon.id, p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as Snapshot;
    },
  });
}

function monthEnd(start: string) {
  return addDays(addMonths(start, 1), -1);
}

export function Dashboard() {
  const { salon, role, userName, can, hasFeature } = useSalon();
  const router = useRouter();
  const isMgmt = can(["owner", "manager"]);
  const today = todayLocal(salon.timezone);
  const monthStart = startOfMonth(today);
  const previousStart = addMonths(monthStart, -1);
  const sb = getSupabase();

  useEffect(() => {
    if (role === "staff") router.replace(`/app/${salon.slug}/kalendar`);
  }, [role, router, salon.slug]);

  const day = useSnapshot(today, today);
  const month = useSnapshot(monthStart, monthEnd(monthStart), isMgmt);
  const previous = useSnapshot(previousStart, monthEnd(previousStart), isMgmt);

  const upcoming = useQuery({
    queryKey: ["upcoming", salon.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("upcoming_bookings", { p_salon: salon.id, p_limit: 6 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pending = useQuery({
    queryKey: ["pending-count", salon.id],
    queryFn: async () => {
      const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", salon.id).eq("status", "pending");
      return count ?? 0;
    },
  });

  const returning = useQuery({
    queryKey: ["return-due", salon.id],
    enabled: isMgmt,
    queryFn: async () => {
      const { count } = await sb
        .from("client_stats")
        .select("client_id", { count: "exact", head: true })
        .eq("salon_id", salon.id)
        .lt("next_expected_at", new Date().toISOString());
      return count ?? 0;
    },
  });


  const overdue = useQuery({
    queryKey: ["overdue", salon.id],
    enabled: hasFeature("invoicing"),
    queryFn: async () => {
      const { data } = await sb.rpc("overdue_invoices", { p_salon: salon.id });
      return data ?? [];
    },
  });

  const automation = useQuery({
    queryKey: ["automation-activity", salon.id, monthStart],
    enabled: isMgmt,
    queryFn: async () => {
      const { data } = await sb
        .from("notifications")
        .select("type,status")
        .eq("salon_id", salon.id)
        .neq("channel", "in_app")
        .gte("created_at", `${monthStart}T00:00:00Z`)
        .limit(2000);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.type] = (counts[row.type] ?? 0) + 1;
      return counts;
    },
  });

  const d = day.data;
  const m = month.data;
  const p = previous.data;
  const hour = toLocal(new Date().toISOString(), salon.timezone).minutes / 60;
  const firstName = userName.split(" ")[0] ?? "";

  const methodRows = d
    ? Object.entries(d.revenue.by_method)
        .filter(([, value]) => value !== 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  const daysInMonth = m?.daily ?? [];
  const compareValues = p?.daily.map((row) => row.received / 100) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: salon.timezone }).format(new Date())}
        title={`${greeting(hour)}${firstName ? `, ${firstName}` : ""}`}
        description="Tady je přehled toho, co se ve vašem salonu právě děje."
        actions={
          <Button asChild size="lg">
            <Link href={`/app/${salon.slug}/kalendar?nova=1`}>
              <CalendarPlus className="h-[18px] w-[18px]" /> Nová rezervace
            </Link>
          </Button>
        }
      />

      {(pending.data ?? 0) > 0 && (
        <Link href={`/app/${salon.slug}/rezervace?stav=pending`} className="mb-5 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 transition-shadow hover:shadow-md">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-warning text-white">
            <BellRing className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-fg">{pending.data} rezervací čeká na potvrzení</span>
            <span className="text-sm text-fg-muted">Klienti čekají na vaši odpověď.</span>
          </span>
          <span className="text-sm font-medium text-warning">Zobrazit</span>
        </Link>
      )}

      <section aria-label="Dnes">
        <SectionHeading icon={CalendarCheck} color="#3056d3" title="Dnes" subtitle={new Date(`${today}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })} />
        <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <StaggerItem>
            <StatCard icon={CalendarCheck} label="Rezervace" value={d?.bookings.total ?? 0} loading={day.isLoading} tone="accent" footer={d ? `${d.bookings.completed} proběhlo, ${d.bookings.upcoming} čeká` : undefined} />
          </StaggerItem>
          <StaggerItem>
            <StatCard icon={Wallet} label="Tržby" value={(d?.revenue.received ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} loading={day.isLoading} tone="success" footer={d && d.revenue.tips > 0 ? `+ spropitné ${czk(d.revenue.tips)}` : undefined} />
          </StaggerItem>
          <StaggerItem>
            <StatCard icon={UserPlus} label="Noví klienti" value={d?.clients.new ?? 0} loading={day.isLoading} tone="info" />
          </StaggerItem>
          <StaggerItem>
            <StatCard icon={UserX} label="Nedostavili se" value={d?.bookings.no_show ?? 0} loading={day.isLoading} tone="danger" />
          </StaggerItem>
          <StaggerItem className="col-span-2 lg:col-span-1">
            <Card interactive className="flex h-full items-center gap-4 p-4 sm:p-5">
              <ProgressRing value={d?.occupancy.ratio ?? 0} size={84} thickness={9} label={<span className="text-lg font-semibold tabular">{percent(d?.occupancy.ratio ?? 0)}</span>} />
              <div>
                <p className="text-sm text-fg-muted">Obsazenost</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{Math.round((d?.occupancy.booked_min ?? 0) / 60)} z {Math.round((d?.occupancy.scheduled_min ?? 0) / 60)} hodin</p>
              </div>
            </Card>
          </StaggerItem>
        </Stagger>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <CardHeader title="Platby dnes" description="Rozpad tržeb podle způsobu platby" />
            <div className="p-5">
              {day.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                  <Skeleton className="h-6" />
                </div>
              ) : methodRows.length === 0 ? (
                <EmptyState icon={CreditCard} compact title="Dnes zatím žádné platby" description="Jakmile zapíšete platbu, ukáže se tady." />
              ) : (
                <div className="space-y-3.5">
                  <p className="text-3xl font-semibold tracking-tight tabular">{czk(d!.revenue.received)}</p>
                  {methodRows.map(([method, value], index) => (
                    <div key={method}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[index % chartColors.length] }} />
                          {paymentMethod[method] ?? method}
                        </span>
                        <span className="font-semibold tabular">{czk(value)}</span>
                      </div>
                      <ProgressBar value={(value / Math.max(1, d!.revenue.received)) * 100} className="h-1.5" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Nejbližší rezervace"
              action={
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/app/${salon.slug}/kalendar`}>Kalendář</Link>
                </Button>
              }
            />
            <div className="p-2">
              {upcoming.isLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : (upcoming.data ?? []).length === 0 ? (
                <EmptyState icon={CalendarCheck} compact title="Žádné nadcházející rezervace" description="Sdílejte odkaz na rezervační stránku a klienti se objednají sami." />
              ) : (
                <ul>
                  {(upcoming.data ?? []).map((row) => {
                    const local = toLocal(row.starts_at, salon.timezone);
                    const status = bookingStatus[row.status];
                    return (
                      <li key={row.id}>
                        <Link href={`/app/${salon.slug}/kalendar?rezervace=${row.id}`} className="flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-surface-2">
                          <div className="w-14 shrink-0 text-center">
                            <p className="text-base font-semibold tabular">{formatTime(row.starts_at, salon.timezone)}</p>
                            <p className="text-[11px] text-fg-subtle">{local.day === todayLocal(salon.timezone) ? "dnes" : `${Number(local.day.slice(8))}. ${Number(local.day.slice(5, 7))}.`}</p>
                          </div>
                          <Avatar name={row.client_name} size={36} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{row.client_name}</p>
                            <p className="truncate text-xs text-fg-muted">{row.services}</p>
                          </div>
                          {status && <Badge tone={status.tone}>{status.label}</Badge>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </section>

      {isMgmt && (
        <section aria-label="Tento měsíc" className="mt-10">
          <SectionHeading icon={TrendingUp} color="#16a34a" title="Tento měsíc" subtitle={new Date(`${monthStart}T12:00:00`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })} />
          <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StaggerItem>
              <StatCard icon={TrendingUp} label="Tržby" value={(m?.revenue.received ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} loading={month.isLoading} tone="success" delta={m && p ? <Delta current={m.revenue.received} previous={p.revenue.received} /> : undefined} spark={daysInMonth.map((row) => row.received)} />
            </StaggerItem>
            <StaggerItem>
              <StatCard icon={Receipt} label="Náklady" value={(m?.expenses?.total ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} loading={month.isLoading} tone="warning" delta={m?.expenses && p?.expenses ? <Delta current={m.expenses.total} previous={p.expenses.total} inverse /> : undefined} />
            </StaggerItem>
            <StaggerItem>
              <StatCard icon={Banknote} label="Hrubý zisk" value={((m?.revenue.received ?? 0) - (m?.expenses?.total ?? 0)) / 100} format={(n) => czk(Math.round(n * 100))} loading={month.isLoading} tone="accent" delta={m && p ? <Delta current={m.revenue.received - (m.expenses?.total ?? 0)} previous={p.revenue.received - (p.expenses?.total ?? 0)} /> : undefined} />
            </StaggerItem>
            <StaggerItem>
              <StatCard icon={Users} label="Aktivní klienti" value={m?.clients.active ?? 0} loading={month.isLoading} tone="info" delta={m && p ? <Delta current={m.clients.active} previous={p.clients.active} /> : undefined} footer={m ? `${m.clients.new} nových, ${m.clients.returning} vracejících se` : undefined} />
            </StaggerItem>
          </Stagger>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Vývoj tržeb" description="Tento měsíc oproti minulému" action={m && p ? <Delta current={m.revenue.received} previous={p.revenue.received} /> : undefined} />
              <div className="p-3 pt-1 sm:p-5">
                <AreaChart
                  height={260}
                  labels={daysInMonth.map((row) => `${Number(row.day.slice(8))}.`)}
                  format={(n) => czkShort(n * 100)}
                  series={[
                    { name: "Tento měsíc", color: "var(--chart-1)", values: daysInMonth.map((row) => row.received / 100) },
                    { name: "Minulý měsíc", color: "var(--chart-4)", values: compareValues.slice(0, daysInMonth.length), dashed: true },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Nejvýdělečnější služby" />
              <div className="flex flex-col items-center gap-5 p-5 sm:flex-row lg:flex-col xl:flex-row">
                <Donut
                  data={(m?.by_service ?? []).slice(0, 6).map((item, index) => ({ label: item.name, value: item.revenue, color: chartColors[index % chartColors.length]! }))}
                  center={
                    <>
                      <span className="text-xs text-fg-subtle">Celkem</span>
                      <span className="text-lg font-semibold tabular">{czkShort(m?.revenue.earned ?? 0)}</span>
                    </>
                  }
                />
                <ul className="w-full space-y-2.5">
                  {(m?.by_service ?? []).slice(0, 5).map((item, index) => (
                    <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chartColors[index % chartColors.length] }} />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="font-semibold tabular">{czkShort(item.revenue)}</span>
                    </li>
                  ))}
                  {(m?.by_service ?? []).length === 0 && <li className="text-sm text-fg-subtle">Zatím žádná data.</li>}
                </ul>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Obsazenost podle dne" description="Které dny mají největší volno" />
              <div className="p-3 sm:p-5">
                <BarChart
                  height={220}
                  labels={weekdayShort}
                  format={(n) => `${Math.round(n)} %`}
                  series={[{ name: "Obsazenost", color: "var(--chart-2)", values: weekdayShort.map((_, index) => Math.round((m?.by_weekday.find((row) => row.weekday === index + 1)?.ratio ?? 0) * 100)) }]}
                />
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Výkon zaměstnanců" description="Tržby, klienti a obsazenost za tento měsíc" />
              <div className="overflow-x-auto p-2 sm:p-3">
                {(m?.by_staff ?? []).length === 0 ? (
                  <EmptyState icon={Users} compact title="Zatím žádná data" />
                ) : (
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                        <th className="px-3 py-2 font-medium">Pracovník</th>
                        <th className="px-3 py-2 text-right font-medium">Tržby</th>
                        <th className="px-3 py-2 text-right font-medium">Klienti</th>
                        <th className="px-3 py-2 font-medium">Obsazenost</th>
                        {hasFeature("commissions") && <th className="px-3 py-2 text-right font-medium">Provize</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(m?.by_staff ?? []).map((row) => {
                        const ratio = row.scheduled_min > 0 ? row.booked_min / row.scheduled_min : 0;
                        return (
                          <tr key={row.staff_id} className="border-t border-border">
                            <td className="px-3 py-3">
                              <span className="flex items-center gap-2.5">
                                <Avatar name={row.name} size={30} />
                                <span className="font-medium">{row.name}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular">{czk(row.revenue)}</td>
                            <td className="px-3 py-3 text-right tabular">{row.clients}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <ProgressBar value={ratio * 100} className="h-1.5 w-24" />
                                <span className="text-xs tabular text-fg-muted">{percent(ratio)}</span>
                              </div>
                            </td>
                            {hasFeature("commissions") && <td className="px-3 py-3 text-right tabular">{czk(row.commission)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Rezervace a útrata" />
              <dl className="grid grid-cols-2 gap-4 p-5">
                <div>
                  <dt className="text-xs text-fg-subtle">Počet rezervací</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular"><AnimatedNumber value={m?.bookings.total ?? 0} /></dd>
                  {m && p && <Delta current={m.bookings.total} previous={p.bookings.total} />}
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Průměrná útrata</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular"><AnimatedNumber value={(m?.average_spend ?? 0) / 100} format={(n) => czk(Math.round(n * 100))} /></dd>
                  {m && p && <Delta current={m.average_spend} previous={p.average_spend} />}
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Obsazenost</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular">{percent(m?.occupancy.ratio ?? 0)}</dd>
                  {m && p && <Delta current={m.occupancy.ratio} previous={p.occupancy.ratio} />}
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">Online rezervace</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular">{m?.bookings.online ?? 0}</dd>
                  <span className="text-xs text-fg-subtle">z {m?.bookings.total ?? 0}</span>
                </div>
              </dl>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Náklady podle kategorií" description="Kam letí peníze tento měsíc" />
              <div className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
                {Object.entries(m?.expenses?.by_category ?? {}).length === 0 && <p className="text-sm text-fg-subtle">Tento měsíc zatím žádné výdaje.</p>}
                {Object.entries(m?.expenses?.by_category ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, value], index) => (
                    <div key={category}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span>{expenseCategories[category] ?? category}</span>
                        <span className="font-semibold tabular">{czk(value)}</span>
                      </div>
                      <ProgressBar value={(value / Math.max(1, m!.expenses!.total)) * 100} className="h-1.5" tone={index === 0 ? "warning" : "accent"} />
                    </div>
                  ))}
              </div>
            </Card>
          </div>
        </section>
      )}

      <section aria-label="Systém pracuje za vás" className="mt-10">
        <SectionHeading icon={Sparkles} color="#d946ef" title="Systém pracuje za vás" subtitle="Zprávy a úkoly, které se dějí automaticky" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="relative overflow-hidden lg:col-span-2">
            <div className="pointer-events-none absolute inset-0 opacity-60 [background:var(--gradient-mesh)]" />
            <CardHeader title="Automatizace tento měsíc" description="Odeslané zprávy, které jste nemuseli psát" className="relative" />
            <div className="relative grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              {(["booking_confirmation", "booking_reminder", "return_reminder", "followup"] as const).map((type) => (
                <div key={type}>
                  <p className="text-3xl font-semibold tracking-tight tabular">
                    <AnimatedNumber value={automation.data?.[type] ?? 0} />
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">{automationTypes[type]?.label}</p>
                </div>
              ))}
            </div>
            <div className="relative flex flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3.5 text-sm text-fg-muted">
              <Repeat className="h-4 w-4 text-accent" />
              {returning.data ? (
                <span>
                  <span className="font-semibold text-fg">{returning.data}</span> klientů je po své obvyklé době. Systém jim pošle pozvánku zpět.
                </span>
              ) : (
                <span>Systém sleduje, jak často klienti chodí, a včas je pozve zpět.</span>
              )}
            </div>
          </Card>

          <div className="grid gap-4">
            {hasFeature("invoicing") && (overdue.data ?? []).length > 0 && (
              <Link href={`/app/${salon.slug}/faktury`}>
                <Card interactive className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-danger-soft text-danger">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Faktury po splatnosti</span>
                    <span className="block text-xs text-fg-muted">{czk((overdue.data ?? []).reduce((sum, row) => sum + Number(row.balance), 0))} k úhradě</span>
                  </span>
                  <Badge tone="danger">{(overdue.data ?? []).length}</Badge>
                </Card>
              </Link>
            )}
            <Link href={`/app/${salon.slug}/vernost`}>
              <Card interactive className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Gift className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Věrnostní program</span>
                  <span className="block text-xs text-fg-muted">Odměňujte pravidelné klienty</span>
                </span>
              </Card>
            </Link>
            {(!hasFeature("invoicing") || (overdue.data ?? []).length === 0) && (
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success-soft text-success">
                  <CalendarCheck className="h-5 w-5" />
                </span>
                <span className="text-sm">
                  <span className="block font-semibold">Vše v pořádku</span>
                  <span className="text-xs text-fg-muted">Nic vyžadujícího pozornost.</span>
                </span>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
