"use client";

import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Clock, LogIn, LogOut, Sparkles, Wallet, Banknote } from "lucide-react";
import { useSalon } from "@/components/app/salon-context";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { errorMessage, useSb } from "@/lib/data";
import { czk } from "@/lib/format";
import { dayBoundsISO, formatDate, formatTime, todayLocal } from "@/lib/time";

export function MyResults() {
  const { salon, staffId, locationId } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const client = useQueryClient();
  const today = todayLocal(salon.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;

  const data = useQuery({
    enabled: !!staffId,
    queryKey: ["my-results", staffId, monthStart],
    queryFn: async () => {
      const bounds = dayBoundsISO(today, salon.timezone);
      const monthBounds = dayBoundsISO(monthStart, salon.timezone);
      const [entries, done, todays, clock] = await Promise.all([
        sb.from("commission_entries").select("id,amount,description,earned_on,payout_id").eq("staff_id", staffId!).gte("earned_on", monthStart).order("earned_on", { ascending: false }).limit(100),
        sb.from("bookings").select("id,price_total,discount_total").eq("primary_staff_id", staffId!).eq("status", "completed").gte("starts_at", monthBounds.from).lt("starts_at", bounds.to),
        sb.from("bookings").select("id,starts_at,status,clients(first_name,last_name),booking_items(name_snap)").eq("primary_staff_id", staffId!).in("status", ["pending", "confirmed", "completed"]).gte("starts_at", bounds.from).lt("starts_at", bounds.to).order("starts_at"),
        sb.from("staff_attendance").select("id,clock_in").eq("staff_id", staffId!).is("clock_out", null).maybeSingle(),
      ]);
      const commissions = (entries.data ?? []) as { id: string; amount: number; description: string; earned_on: string; payout_id: string | null }[];
      const completed = (done.data ?? []) as { price_total: number; discount_total: number }[];
      return {
        commissions,
        earned: commissions.reduce((sum, c) => sum + Number(c.amount), 0),
        unpaid: commissions.filter((c) => !c.payout_id).reduce((sum, c) => sum + Number(c.amount), 0),
        visits: completed.length,
        revenue: completed.reduce((sum, b) => sum + Number(b.price_total) - Number(b.discount_total ?? 0), 0),
        today: (todays.data ?? []) as any[],
        clockedIn: (clock.data as { clock_in: string } | null)?.clock_in ?? null,
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = data.data?.clockedIn ? await sb.rpc("clock_out", { p_staff: staffId! }) : await sb.rpc("clock_in", { p_staff: staffId!, p_location: locationId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(data.data?.clockedIn ? "Odchod zapsán" : "Příchod zapsán");
      client.invalidateQueries({ queryKey: ["my-results"] });
    },
    onError: (error) => toast.error("Docházku se nepodařilo zapsat", errorMessage(error)),
  });

  if (!staffId) return <EmptyState icon={Sparkles} title="Nemáte propojený profil pracovníka" description="Požádejte majitele salonu, aby váš účet propojil s profilem v sekci Tým." />;
  const d = data.data;

  return (
    <div>
      <PageHeader
        title="Moje výsledky"
        description="Vaše návštěvy, tržby a provize za tento měsíc."
        actions={
          <Button loading={toggle.isPending} variant={d?.clockedIn ? "secondary" : "primary"} onClick={() => toggle.mutate()} leading={d?.clockedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />}>
            {d?.clockedIn ? "Odejít z práce" : "Příchod do práce"}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Dokončené návštěvy" value={d?.visits ?? 0} tone="accent" loading={data.isLoading} />
        <StatCard icon={Wallet} label="Tržba z návštěv" value={d?.revenue ?? 0} format={(n) => czk(n)} tone="success" loading={data.isLoading} />
        <StatCard icon={Banknote} label="Provize za měsíc" value={d?.earned ?? 0} format={(n) => czk(n)} tone="pink" loading={data.isLoading} />
        <StatCard icon={Clock} label="Čeká na výplatu" value={d?.unpaid ?? 0} format={(n) => czk(n)} tone="warning" loading={data.isLoading} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dnešní program" />
          <ul className="divide-y divide-border p-2">
            {data.isLoading && <Skeleton className="m-3 h-20 rounded-lg" />}
            {d && d.today.length === 0 && <li className="p-4 text-sm text-fg-muted">Dnes nemáte žádné rezervace.</li>}
            {d?.today.map((booking) => (
              <li key={booking.id} className="flex items-center gap-3 px-3 py-3">
                <span className="w-14 shrink-0 font-semibold tabular">{formatTime(booking.starts_at, salon.timezone)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {booking.clients?.first_name} {booking.clients?.last_name}
                  </span>
                  <span className="block truncate text-sm text-fg-muted">{(booking.booking_items ?? []).map((i: { name_snap: string }) => i.name_snap).join(", ")}</span>
                </span>
                {booking.status === "completed" && <Badge tone="success">Hotovo</Badge>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Provize tento měsíc" />
          <ul className="max-h-96 divide-y divide-border overflow-y-auto p-2">
            {d && d.commissions.length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím žádné provize.</li>}
            {d?.commissions.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{entry.description}</span>
                  <span className="text-xs text-fg-subtle">{formatDate(`${entry.earned_on}T12:00:00Z`, salon.timezone)}</span>
                </span>
                <span className="font-semibold tabular">{czk(Number(entry.amount))}</span>
                {entry.payout_id && <Badge tone="success">Vyplaceno</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
