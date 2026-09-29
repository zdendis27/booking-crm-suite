"use client";

import { addDays, Badge, Button, Card, Dialog, EmptyState, Field, Input, Skeleton, Tabs, useToast } from "@repo/ui";
import { bookingStatus } from "@repo/copy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { BellRing, CalendarCheck, CalendarClock, CalendarX, Check, CreditCard, Gift, MapPin, Sparkles, Store, User } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data";
import { czk } from "@/lib/format";
import { formatTime, toLocal, todayLocal } from "@/lib/time";
import { InlineAuth, useAuthUser } from "@/components/booking/inline-auth";
import type { Database } from "@repo/db";

type CustomerBooking = Database["public"]["Functions"]["customer_bookings"]["Returns"][number];
type Tab = "bookings" | "loyalty" | "salons" | "waitlist" | "profile";

function longDate(iso: string, tz: string) {
  const local = toLocal(iso, tz);
  const date = new Date(`${local.day}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
  return `${date} v ${local.time}`;
}

export function CustomerHome() {
  const { user, ready } = useAuthUser();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("bookings");
  const paid = params.get("zaplaceno");

  if (!ready) return <Skeleton className="h-64 rounded-2xl" />;
  if (!user) {
    return (
      <div className="mx-auto grid max-w-md gap-4 pt-10">
        <h1 className="text-2xl font-bold tracking-tight">Vaše rezervace</h1>
        <p className="text-fg-muted">Přihlaste se e-mailem a uvidíte všechny své termíny, věrnostní karty a oblíbené salony.</p>
        <InlineAuth next="/moje" />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {paid && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
          <Check className="size-5" /> Záloha je zaplacená, rezervace se potvrdí během chvilky.
        </motion.div>
      )}
      <Tabs
        variant="pill"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "bookings", label: "Rezervace" },
          { value: "loyalty", label: "Věrnost" },
          { value: "salons", label: "Salony" },
          { value: "waitlist", label: "Čekání" },
          { value: "profile", label: "Profil" },
        ]}
      />
      {tab === "bookings" && <Bookings />}
      {tab === "loyalty" && <Loyalty />}
      {tab === "salons" && <Salons />}
      {tab === "waitlist" && <WaitlistTab />}
      {tab === "profile" && <Profile email={user.email ?? ""} />}
    </div>
  );
}

function Bookings() {
  const toast = useToast();
  const client = useQueryClient();
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [moving, setMoving] = useState<CustomerBooking | null>(null);
  const [cancelling, setCancelling] = useState<CustomerBooking | null>(null);

  const list = useQuery({
    queryKey: ["customer-bookings"],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("customer_bookings");
      if (error) throw error;
      return data ?? [];
    },
  });

  const cancel = useMutation({
    mutationFn: async (booking: CustomerBooking) => {
      const { error } = await getSupabase().rpc("set_booking_status", { p_booking: booking.id, p_status: "cancelled_by_client" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rezervace zrušena");
      setCancelling(null);
      client.invalidateQueries({ queryKey: ["customer-bookings"] });
    },
    onError: (error) => toast.error("Zrušení se nepodařilo", errorMessage(error)),
  });

  async function payDeposit(booking: CustomerBooking) {
    const response = await fetch("/api/stripe/deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: booking.id }) });
    const data = await response.json();
    if (!response.ok) {
      toast.error("Platba se nepodařila", data.error);
      return;
    }
    window.location.assign(data.url);
  }

  const now = Date.now();
  const upcoming = (list.data ?? []).filter((b) => new Date(b.ends_at).getTime() >= now && ["pending", "confirmed"].includes(b.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (list.data ?? []).filter((b) => !upcoming.includes(b));
  const shown = view === "upcoming" ? upcoming : past;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
          {(["upcoming", "past"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-4 py-1.5 font-medium transition ${view === v ? "bg-surface shadow-xs" : "text-fg-muted"}`}>
              {v === "upcoming" ? `Nadcházející (${upcoming.length})` : `Historie (${past.length})`}
            </button>
          ))}
        </div>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : shown.length === 0 ? (
        <EmptyState icon={CalendarClock} title={view === "upcoming" ? "Žádná nadcházející rezervace" : "Zatím žádná historie"} description="Otevřete stránku svého salonu a objednejte se na pár kliknutí." />
      ) : (
        <div className="grid gap-3">
          {shown.map((booking, index) => {
            const status = bookingStatus[booking.status] ?? { label: booking.status, tone: "neutral" as const };
            const active = ["pending", "confirmed"].includes(booking.status) && new Date(booking.ends_at).getTime() >= now;
            return (
              <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <Card className="overflow-hidden">
                  <div className="h-1.5" style={{ background: booking.brand_color || "var(--accent)" }} />
                  <div className="grid gap-3 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/s/${booking.salon_slug}`} className="text-lg font-semibold hover:underline">
                          {booking.salon_name}
                        </Link>
                        <p className="mt-0.5 first-letter:uppercase text-fg-muted">{longDate(booking.starts_at, booking.timezone)}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <div className="grid gap-1.5 text-sm text-fg-muted">
                      <p className="flex items-center gap-2">
                        <Sparkles className="size-4 shrink-0" /> {booking.services}
                        {booking.staff ? ` · ${booking.staff}` : ""}
                      </p>
                      {booking.location_address && (
                        <p className="flex items-center gap-2">
                          <MapPin className="size-4 shrink-0" /> {booking.location_address}
                        </p>
                      )}
                      <p className="font-medium text-fg">{czk(Number(booking.price_total) - Number(booking.discount_total ?? 0))}</p>
                    </div>
                    {active && (
                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        {booking.status === "pending" && Number(booking.deposit_amount ?? 0) > 0 && (
                          <Button size="sm" onClick={() => payDeposit(booking)} leading={<CreditCard className="size-4" />}>
                            Zaplatit zálohu {czk(Number(booking.deposit_amount))}
                          </Button>
                        )}
                        {booking.can_change ? (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => setMoving(booking)} leading={<CalendarClock className="size-4" />}>
                              Změnit termín
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setCancelling(booking)} leading={<CalendarX className="size-4" />}>
                              Zrušit
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs text-fg-subtle">Storno lhůta už uplynula, zavolejte prosím do salonu.</p>
                        )}
                      </div>
                    )}
                    {!active && booking.status === "completed" && (
                      <div className="border-t border-border pt-3">
                        <Button size="sm" variant="secondary" asChild>
                          <Link href={`/s/${booking.salon_slug}/rezervace`}>Rezervovat znovu</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)} title="Zrušit rezervaci?" description={cancelling ? `${cancelling.salon_name}, ${longDate(cancelling.starts_at, cancelling.timezone)}` : undefined} size="sm" footer={<><Button variant="ghost" onClick={() => setCancelling(null)}>Ponechat</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling)}>Zrušit rezervaci</Button></>}>
        <p className="text-sm text-fg-muted">Termín se uvolní pro ostatní. Tuto akci nelze vrátit zpět.</p>
      </Dialog>
      {moving && <RescheduleDialog booking={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

function RescheduleDialog({ booking, onClose }: { booking: CustomerBooking; onClose: () => void }) {
  const toast = useToast();
  const client = useQueryClient();
  const tz = booking.timezone;
  const [day, setDay] = useState<string | null>(null);
  const today = todayLocal(tz);

  const slots = useQuery({
    queryKey: ["reschedule", booking.id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: items, error } = await supabase.rpc("customer_booking_items", { p_booking: booking.id });
      if (error) throw error;
      const staff = items?.[0]?.staff_id;
      const params = new URLSearchParams({ location: booking.location_id, services: (items ?? []).map((i) => i.service_id).join(","), from: today, to: addDays(today, 21) });
      if (staff) params.set("staff", staff);
      const response = await fetch(`/api/public/availability?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data.slots as { start: string }[];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots.data ?? []) {
      if (new Date(s.start).getTime() < Date.now()) continue;
      const d = toLocal(s.start, tz).day;
      map.set(d, [...(map.get(d) ?? []), s.start]);
    }
    return map;
  }, [slots.data, tz]);

  const days = [...byDay.keys()].sort();
  const activeDay = day ?? days[0] ?? null;

  const move = useMutation({
    mutationFn: async (start: string) => {
      const { error } = await getSupabase().rpc("customer_reschedule_booking", { p_booking: booking.id, p_new_start: start });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Termín změněn");
      client.invalidateQueries({ queryKey: ["customer-bookings"] });
      onClose();
    },
    onError: (error) => toast.error("Změna se nepodařila", errorMessage(error)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Změnit termín" description={`${booking.salon_name} · ${booking.services}`}>
      {slots.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !days.length ? (
        <p className="text-sm text-fg-muted">V nejbližších třech týdnech není volný termín. Zkuste to později nebo zavolejte do salonu.</p>
      ) : (
        <div className="grid gap-4">
          <div className="ui-scroll flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const date = new Date(`${d}T12:00:00`);
              const on = d === activeDay;
              return (
                <button key={d} onClick={() => setDay(d)} className={`grid min-w-14 shrink-0 place-items-center rounded-xl border px-2 py-2 transition ${on ? "border-transparent bg-accent text-white" : "border-border bg-surface hover:bg-surface-2"}`}>
                  <span className="text-xs">{date.toLocaleDateString("cs-CZ", { weekday: "short" })}</span>
                  <span className="text-lg font-bold leading-tight">{date.getDate()}.{date.getMonth() + 1}.</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(activeDay ? byDay.get(activeDay) ?? [] : []).map((start) => (
              <button key={start} disabled={move.isPending} onClick={() => move.mutate(start)} className="h-11 rounded-xl border border-border bg-surface text-sm font-semibold transition hover:border-accent hover:bg-accent-soft disabled:opacity-50">
                {formatTime(start, tz)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Loyalty() {
  const cards = useQuery({
    queryKey: ["customer-loyalty"],
    queryFn: async () => (await getSupabase().rpc("customer_loyalty_cards")).data ?? [],
  });
  if (cards.isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!cards.data?.length) return <EmptyState icon={Gift} tone="pink" title="Zatím žádné věrnostní karty" description="Razítka získáte za dokončené návštěvy v salonech s věrnostním programem." />;
  return (
    <div className="grid gap-4">
      {cards.data.map((card, index) => {
        const filled = card.stamps % card.threshold;
        const reward = card.reward_type === "free_service" ? `${card.reward_service_name ?? "služba"} zdarma` : card.reward_type === "percent_discount" ? `sleva ${card.reward_value} %` : `sleva ${czk(Number(card.reward_value))}`;
        return (
          <motion.div key={card.program_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg" style={{ background: "var(--gradient-brand)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm opacity-80">Věrnostní karta</p>
                <Link href={`/s/${card.salon_slug}`} className="text-xl font-bold hover:underline">
                  {card.salon_name}
                </Link>
              </div>
              {card.available_rewards > 0 && <Badge tone="warning">Odměna k dispozici</Badge>}
            </div>
            <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-6">
              {Array.from({ length: card.threshold }, (_, i) => (
                <motion.span key={i} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.05, type: "spring", stiffness: 300 }} className={`grid aspect-square place-items-center rounded-full border-2 ${i < filled ? "border-white bg-white text-accent" : "border-white/40"}`}>
                  {i < filled && <Check className="size-4" strokeWidth={3} />}
                </motion.span>
              ))}
            </div>
            <p className="mt-4 text-sm">
              {card.available_rewards > 0 ? `Máte odměnu: ${reward}. Uplatněte ji při další návštěvě.` : `Ještě ${card.threshold - filled} ${card.threshold - filled === 1 ? "návštěva" : "návštěvy"} do odměny: ${reward}.`}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

function Salons() {
  const salons = useQuery({
    queryKey: ["customer-salons"],
    queryFn: async () => (await getSupabase().rpc("customer_salons")).data ?? [],
  });
  if (salons.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!salons.data?.length) return <EmptyState icon={Store} title="Zatím žádné salony" description="Salony, kde jste rezervovali, se objeví tady." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {salons.data.map((salon) => (
        <Card key={salon.salon_id} interactive className="grid gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: salon.brand_color || "var(--accent)" }}>
              {salon.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{salon.name}</p>
              <p className="text-sm text-fg-muted">
                {salon.city ? `${salon.city} · ` : ""}
                {salon.visits} {salon.visits === 1 ? "návštěva" : salon.visits < 5 ? "návštěvy" : "návštěv"}
              </p>
            </div>
          </div>
          <Button size="sm" asChild leading={<CalendarCheck className="size-4" />}>
            <Link href={`/s/${salon.slug}/rezervace`}>Rezervovat</Link>
          </Button>
        </Card>
      ))}
    </div>
  );
}

function WaitlistTab() {
  const toast = useToast();
  const client = useQueryClient();
  const entries = useQuery({
    queryKey: ["customer-waitlist"],
    queryFn: async () => (await getSupabase().rpc("customer_waitlist")).data ?? [],
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().rpc("customer_cancel_waitlist", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hlídání zrušeno");
      client.invalidateQueries({ queryKey: ["customer-waitlist"] });
    },
  });
  if (entries.isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  if (!entries.data?.length) return <EmptyState icon={BellRing} tone="warning" title="Nic nehlídáme" description="Když nenajdete volný termín, nabídneme vám upozornění, jakmile se nějaký uvolní." />;
  return (
    <div className="grid gap-3">
      {entries.data.map((entry) => (
        <Card key={entry.id} className="flex items-center gap-3 p-4">
          <span className="grid size-11 place-items-center rounded-xl bg-warning-soft text-warning">
            <BellRing className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{entry.salon_name}</p>
            <p className="truncate text-sm text-fg-muted">
              {entry.services} · {new Date(entry.date_from).toLocaleDateString("cs-CZ")} až {new Date(entry.date_to).toLocaleDateString("cs-CZ")}
            </p>
          </div>
          <Badge tone={entry.status === "offered" ? "success" : "neutral"}>{entry.status === "offered" ? "Nabídnuto" : "Čeká"}</Badge>
          <Button size="sm" variant="ghost" onClick={() => remove.mutate(entry.id)}>
            Zrušit
          </Button>
        </Card>
      ))}
    </div>
  );
}

function Profile({ email }: { email: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const account = useQuery({
    queryKey: ["customer-account"],
    queryFn: async () => {
      const { data } = await getSupabase().from("customer_accounts").select("first_name,last_name,birthday,phone,phone_verified_at").maybeSingle();
      return data;
    },
  });
  const [form, setForm] = useState<{ first: string; last: string; birthday: string } | null>(null);
  const values = form ?? { first: account.data?.first_name ?? "", last: account.data?.last_name ?? "", birthday: account.data?.birthday ?? "" };

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await getSupabase().auth.getUser();
      const { error } = await getSupabase().from("customer_accounts").update({ first_name: values.first.trim() || null, last_name: values.last.trim() || null, birthday: values.birthday || null }).eq("user_id", userData.user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profil uložen");
      setForm(null);
      client.invalidateQueries({ queryKey: ["customer-account"] });
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  if (account.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
          <User className="size-6" />
        </span>
        <div>
          <p className="font-semibold">{email}</p>
          <p className="text-sm text-fg-muted">{account.data?.phone ? `Telefon ${account.data.phone}${account.data.phone_verified_at ? " (ověřený)" : ""}` : "Telefon zatím nepřidán"}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jméno">
          <Input value={values.first} onChange={(e) => setForm({ ...values, first: e.target.value })} autoComplete="given-name" />
        </Field>
        <Field label="Příjmení">
          <Input value={values.last} onChange={(e) => setForm({ ...values, last: e.target.value })} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Datum narození" hint="Salon vám může poslat přání a narozeninovou nabídku">
        <Input type="date" value={values.birthday} onChange={(e) => setForm({ ...values, birthday: e.target.value })} />
      </Field>
      <Button loading={save.isPending} disabled={!form} onClick={() => save.mutate()} className="justify-self-start">
        Uložit změny
      </Button>
    </Card>
  );
}
