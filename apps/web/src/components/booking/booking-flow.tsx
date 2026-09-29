"use client";

import { addDays, Badge, Button, Card, Confetti, Field, Logo, Skeleton, Textarea, useToast } from "@repo/ui";
import { brand } from "@repo/copy";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BellRing, CalendarCheck, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, CreditCard, MapPin, Sparkles, User, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data";
import { czk } from "@/lib/format";
import { durationLabel, formatTime, toLocal, todayLocal } from "@/lib/time";
import { mediaUrl } from "@/lib/storage";
import type { PublicSalon, PublicService } from "@/lib/public-types";
import { InlineAuth, useAuthUser } from "./inline-auth";

interface Slot {
  staff_id: string;
  start: string;
  end: string;
}

interface Draft {
  slug: string;
  locationId: string;
  selected: string[];
  staffId: string;
  slot: { start: string; staffId: string } | null;
  note: string;
  step: number;
}

interface Done {
  bookingId: string;
  status: string;
  deposit: number;
  start: string;
  end: string;
}

const steps = ["Služby", "Specialista", "Termín", "Potvrzení"];
const weekdayShort = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
const windows = [
  { value: "any", label: "Kdykoli", from: null, to: null },
  { value: "am", label: "Dopoledne", from: "08:00", to: "12:00" },
  { value: "pm", label: "Odpoledne", from: "12:00", to: "17:00" },
  { value: "eve", label: "Večer", from: "17:00", to: "21:00" },
] as const;

function dayLabel(day: string) {
  const date = new Date(`${day}T12:00:00`);
  return { weekday: weekdayShort[date.getDay()]!, number: date.getDate(), month: date.toLocaleDateString("cs-CZ", { month: "short" }) };
}

function longDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
}

function icsFor(salon: PublicSalon, done: Done, services: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${brand.name}//CS`, "BEGIN:VEVENT", `UID:${done.bookingId}@${brand.name.toLowerCase()}`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(done.start)}`, `DTEND:${stamp(done.end)}`, `SUMMARY:${salon.name}: ${services}`, `LOCATION:${[salon.address.street, salon.address.city].filter(Boolean).join(", ")}`, "END:VEVENT", "END:VCALENDAR"];
  return new Blob([lines.join("\r\n")], { type: "text/calendar" });
}

export function BookingFlow({ salon, initialService }: { salon: PublicSalon; initialService?: string }) {
  const toast = useToast();
  const { user, ready } = useAuthUser();
  const tz = salon.timezone;
  const accent = salon.brand_color || "#3056d3";
  const draftKey = `booking-draft:${salon.slug}`;

  const [step, setStep] = useState(0);
  const [locationId, setLocationId] = useState(salon.locations[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>(initialService && salon.services.some((s) => s.id === initialService) ? [initialService] : []);
  const [staffId, setStaffId] = useState("any");
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: string; staffId: string } | null>(null);
  const [page, setPage] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (draft.slug !== salon.slug) return;
      setLocationId(draft.locationId);
      setSelected(draft.selected);
      setStaffId(draft.staffId);
      setSlot(draft.slot);
      setNote(draft.note);
      setStep(draft.step);
      sessionStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }, [draftKey, salon.slug]);

  function saveDraft() {
    try {
      const draft: Draft = { slug: salon.slug, locationId, selected, staffId, slot, note, step };
      sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      return;
    }
  }

  const location = salon.locations.find((l) => l.id === locationId) ?? salon.locations[0];
  const locationStaff = useMemo(() => salon.staff.filter((s) => s.location_ids.includes(locationId)), [salon.staff, locationId]);
  const bookable = useMemo(() => salon.services.filter((s) => locationStaff.some((m) => s.id in m.services)), [salon.services, locationStaff]);
  const chosen = useMemo(() => selected.map((id) => salon.services.find((s) => s.id === id)).filter(Boolean) as PublicService[], [selected, salon.services]);
  const eligible = useMemo(() => locationStaff.filter((m) => selected.every((id) => id in m.services)), [locationStaff, selected]);
  const staffMember = staffId === "any" ? null : eligible.find((m) => m.id === staffId) ?? null;

  const totals = useMemo(() => {
    const perService = chosen.map((s) => {
      const override = staffMember?.services[s.id];
      return { price: override?.price ?? s.price, duration: override?.duration_min ?? s.duration_min };
    });
    return { price: perService.reduce((a, b) => a + b.price, 0), duration: perService.reduce((a, b) => a + b.duration, 0) };
  }, [chosen, staffMember]);

  const today = todayLocal(tz);
  const maxAdvance = location?.settings?.max_advance_days ?? 60;
  const rangeStart = addDays(today, page * 14);
  const rangeEnd = addDays(rangeStart, 13);
  const lastDay = addDays(today, maxAdvance);

  const availability = useQuery({
    queryKey: ["availability", locationId, selected.join(","), staffId, rangeStart],
    enabled: step >= 2 && selected.length > 0 && !!locationId && rangeStart <= lastDay,
    queryFn: async () => {
      const params = new URLSearchParams({ location: locationId, services: selected.join(","), from: rangeStart, to: rangeEnd < lastDay ? rangeEnd : lastDay });
      if (staffId !== "any") params.set("staff", staffId);
      const response = await fetch(`/api/public/availability?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Termíny se nepodařilo načíst");
      return data.slots as Slot[];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    const now = Date.now();
    for (const s of availability.data ?? []) {
      if (new Date(s.start).getTime() < now) continue;
      const local = toLocal(s.start, tz);
      const dayMap = map.get(local.day) ?? new Map<string, string[]>();
      dayMap.set(s.start, [...(dayMap.get(s.start) ?? []), s.staff_id]);
      map.set(local.day, dayMap);
    }
    return map;
  }, [availability.data, tz]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(rangeStart, i)).filter((d) => d <= lastDay), [rangeStart, lastDay]);

  useEffect(() => {
    if (step !== 2 || availability.isLoading || !availability.data) return;
    if (day && byDay.has(day)) return;
    const first = days.find((d) => byDay.has(d)) ?? null;
    setDay(first);
  }, [step, availability.isLoading, availability.data, byDay, days, day]);

  useEffect(() => {
    setSlot(null);
    setDay(null);
  }, [selected, staffId, locationId, page]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    setStaffId("any");
  }

  const hasStaffChoice = eligible.length > 1;
  const nextStep = () => setStep((s) => (s === 0 && !hasStaffChoice ? 2 : s + 1));
  const prevStep = () => setStep((s) => (s === 2 && !hasStaffChoice ? 0 : s - 1));

  const activeSlots = day ? [...(byDay.get(day) ?? new Map<string, string[]>()).entries()].sort((a, b) => a[0].localeCompare(b[0])) : [];
  const groups = [
    { label: "Dopoledne", items: activeSlots.filter(([start]) => toLocal(start, tz).minutes < 12 * 60) },
    { label: "Odpoledne", items: activeSlots.filter(([start]) => toLocal(start, tz).minutes >= 12 * 60 && toLocal(start, tz).minutes < 17 * 60) },
    { label: "Večer", items: activeSlots.filter(([start]) => toLocal(start, tz).minutes >= 17 * 60) },
  ].filter((g) => g.items.length);

  async function confirm() {
    if (!slot) return;
    setBusy(true);
    try {
      const supabase = getSupabase();
      const items = selected.map((service_id) => ({ service_id, staff_id: slot.staffId }));
      const { data: id, error } = await supabase.rpc("customer_create_booking", { p_location: locationId, p_items: items, p_starts_at: slot.start, p_client_note: note.trim() || undefined });
      if (error) throw error;
      const { data: list } = await supabase.rpc("customer_bookings");
      const booking = (list ?? []).find((b) => b.id === id);
      setDone({ bookingId: id as string, status: booking?.status ?? "confirmed", deposit: Number(booking?.deposit_amount ?? 0), start: booking?.starts_at ?? slot.start, end: booking?.ends_at ?? slot.start });
    } catch (error) {
      toast.error("Rezervace se nepodařila", errorMessage(error));
      if (/slot|dostupn/i.test(errorMessage(error))) {
        setSlot(null);
        setStep(2);
        availability.refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function payDeposit() {
    if (!done) return;
    setBusy(true);
    try {
      const response = await fetch("/api/stripe/deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: done.bookingId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Platbu se nepodařilo spustit");
      window.location.assign(data.url);
    } catch (error) {
      toast.error("Platba se nepodařila", errorMessage(error));
      setBusy(false);
    }
  }

  function downloadIcs() {
    if (!done) return;
    const url = URL.createObjectURL(icsFor(salon, done, chosen.map((s) => s.name).join(", ")));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rezervace.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  const canContinue = step === 0 ? selected.length > 0 : step === 1 ? true : step === 2 ? !!slot : false;

  if (done) {
    const local = toLocal(done.start, tz);
    const needsDeposit = done.status === "pending" && done.deposit > 0;
    return (
      <div className="min-h-screen bg-bg px-4 py-10">
        <Confetti />
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 22 }} className="mx-auto grid max-w-md gap-5 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 16 }} className="mx-auto grid size-20 place-items-center rounded-full text-white shadow-xl" style={{ background: accent }}>
            <Check className="size-10" strokeWidth={3} />
          </motion.span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{done.status === "pending" ? (needsDeposit ? "Ještě záloha a máte hotovo" : "Rezervace přijata") : "Máte rezervováno!"}</h1>
            <p className="mt-2 text-fg-muted">
              {done.status === "pending" && !needsDeposit ? "Salon vaši rezervaci brzy potvrdí, dostanete e-mail." : "Potvrzení jsme vám poslali e-mailem."}
            </p>
          </div>
          <Card className="grid gap-3 p-5 text-left">
            <p className="text-lg font-semibold">{salon.name}</p>
            <div className="grid gap-2 text-sm">
              <p className="flex items-center gap-2.5">
                <CalendarCheck className="size-4 text-accent" /> {longDay(local.day)} v {local.time}
              </p>
              <p className="flex items-center gap-2.5">
                <Sparkles className="size-4 text-accent" /> {chosen.map((s) => s.name).join(", ")}
              </p>
              {location && (location.street || location.city) && (
                <p className="flex items-center gap-2.5">
                  <MapPin className="size-4 text-accent" /> {[location.street, location.city].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </Card>
          {needsDeposit && (
            <Button size="lg" loading={busy} onClick={payDeposit} leading={<CreditCard className="size-5" />}>
              Zaplatit zálohu {czk(done.deposit)}
            </Button>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={downloadIcs} leading={<CalendarPlus className="size-4" />}>
              Přidat do kalendáře
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/moje">Moje rezervace</Link>
            </Button>
          </div>
          <Link href={`/s/${salon.slug}`} className="text-sm font-medium text-fg-muted hover:text-fg">
            Zpět na stránku salonu
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-32" style={{ ["--salon" as string]: accent }}>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={`/s/${salon.slug}`} aria-label="Zpět" className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="size-5" />
          </Link>
          <p className="min-w-0 flex-1 truncate font-semibold">{salon.name}</p>
          <Logo name="" size={24} />
        </div>
        <div className="mx-auto flex max-w-3xl gap-1.5 px-4 pb-3">
          {steps.map((label, index) => (
            <div key={label} className="flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="h-full rounded-full" style={{ background: accent }} initial={false} animate={{ width: index <= step ? "100%" : "0%" }} transition={{ duration: 0.35 }} />
              </div>
              <p className={`mt-1 hidden text-xs sm:block ${index === step ? "font-semibold text-fg" : "text-fg-subtle"}`}>{label}</p>
            </div>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <div className="grid gap-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Co si přejete?</h1>
                  <p className="mt-1 text-fg-muted">Můžete vybrat i více služeb najednou.</p>
                </div>
                {salon.locations.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {salon.locations.map((l) => (
                      <button key={l.id} onClick={() => { setLocationId(l.id); setSelected([]); }} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${l.id === locationId ? "border-transparent text-white" : "border-border bg-surface hover:bg-surface-2"}`} style={l.id === locationId ? { background: accent } : undefined}>
                        <MapPin className="size-4" /> {l.name}
                      </button>
                    ))}
                  </div>
                )}
                {[...salon.categories, { id: "", name: "Ostatní" }].map((category) => {
                  const items = bookable.filter((s) => (s.category_id ?? "") === category.id);
                  if (!items.length) return null;
                  return (
                    <div key={category.id || "other"}>
                      {(salon.categories.length > 0) && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">{category.name}</h2>}
                      <div className="grid gap-2">
                        {items.map((service) => {
                          const on = selected.includes(service.id);
                          return (
                            <button key={service.id} onClick={() => toggle(service.id)} className={`flex items-center gap-4 rounded-xl border p-4 text-left transition ${on ? "bg-accent-soft" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"}`} style={on ? { borderColor: accent } : undefined}>
                              <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${on ? "text-white" : "border-border-strong"}`} style={on ? { background: accent, borderColor: accent } : undefined}>
                                {on && <Check className="size-3.5" strokeWidth={3} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold">{service.name}</span>
                                {service.description && <span className="line-clamp-1 block text-sm text-fg-muted">{service.description}</span>}
                                <span className="mt-0.5 flex items-center gap-1 text-sm text-fg-muted">
                                  <Clock className="size-3.5" /> {durationLabel(service.duration_min)}
                                </span>
                              </span>
                              <span className="font-semibold">
                                {service.price_is_from ? "od " : ""}
                                {czk(service.price)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!bookable.length && <p className="text-fg-muted">V tomto salonu zatím nejde rezervovat online.</p>}
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Ke komu půjdete?</h1>
                  <p className="mt-1 text-fg-muted">Zvolte konkrétního specialistu, nebo nám nechte výběr.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <button onClick={() => setStaffId("any")} className={`grid place-items-center gap-2 rounded-2xl border p-4 text-center transition ${staffId === "any" ? "bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"}`} style={staffId === "any" ? { borderColor: accent } : undefined}>
                    <span className="grid size-16 place-items-center rounded-full bg-surface-3 text-fg-muted">
                      <Users className="size-7" />
                    </span>
                    <span className="font-semibold">Kdokoli</span>
                    <span className="text-xs text-fg-muted">Nejdřív volný termín</span>
                  </button>
                  {eligible.map((member) => {
                    const photo = mediaUrl(member.photo_path);
                    const on = staffId === member.id;
                    return (
                      <button key={member.id} onClick={() => setStaffId(member.id)} className={`grid place-items-center gap-2 rounded-2xl border p-4 text-center transition ${on ? "bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"}`} style={on ? { borderColor: accent } : undefined}>
                        <span className="grid size-16 place-items-center overflow-hidden rounded-full text-2xl font-bold text-white" style={{ background: member.color || accent }}>
                          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : member.name.slice(0, 1)}
                        </span>
                        <span className="font-semibold">{member.name}</span>
                        {member.title && <span className="text-xs text-fg-muted">{member.title}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Vyberte termín</h1>
                  <p className="mt-1 text-fg-muted">Celkem {durationLabel(totals.duration)}{staffMember ? ` u ${staffMember.name}` : ""}.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="icon-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Dřívější dny">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <div className="ui-scroll flex flex-1 gap-2 overflow-x-auto py-1">
                    {days.map((d) => {
                      const label = dayLabel(d);
                      const count = byDay.get(d)?.size ?? 0;
                      const on = d === day;
                      return (
                        <button key={d} disabled={!count} onClick={() => { setDay(d); setSlot(null); }} className={`grid min-w-[58px] shrink-0 place-items-center rounded-xl border px-2 py-2 transition disabled:opacity-40 ${on ? "border-transparent text-white shadow-md" : "border-border bg-surface hover:bg-surface-2"}`} style={on ? { background: accent } : undefined}>
                          <span className="text-xs">{label.weekday}</span>
                          <span className="text-lg font-bold leading-tight">{label.number}</span>
                          <span className="text-[10px] uppercase opacity-80">{label.month}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="secondary" size="icon-sm" disabled={addDays(rangeStart, 14) > lastDay} onClick={() => setPage((p) => p + 1)} aria-label="Pozdější dny">
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                {availability.isLoading ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} className="h-11 rounded-xl" />
                    ))}
                  </div>
                ) : availability.isError ? (
                  <p className="text-danger">{(availability.error as Error).message}</p>
                ) : day && groups.length ? (
                  <div className="grid gap-4">
                    <p className="font-medium first-letter:uppercase">{longDay(day)}</p>
                    {groups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{group.label}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                          {group.items.map(([start, staffIds]) => {
                            const on = slot?.start === start;
                            return (
                              <button key={start} onClick={() => setSlot({ start, staffId: staffId !== "any" ? staffId : staffIds[0]! })} className={`h-11 rounded-xl border text-sm font-semibold transition ${on ? "border-transparent text-white shadow-md" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"}`} style={on ? { background: accent } : undefined}>
                                {formatTime(start, tz)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Waitlist salon={salon} locationId={locationId} services={selected} staffId={staffId} user={!!user} onBeforeRedirect={saveDraft} />
                )}
              </div>
            )}

            {step === 3 && slot && (
              <div className="grid gap-5">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Skoro hotovo</h1>
                  <p className="mt-1 text-fg-muted">Zkontrolujte rezervaci a potvrďte ji.</p>
                </div>
                <Card className="grid gap-4 p-5">
                  <div className="grid gap-2.5 text-sm">
                    <p className="flex items-center gap-2.5 font-semibold">
                      <CalendarCheck className="size-4 text-accent" /> <span className="inline-block first-letter:uppercase">{longDay(toLocal(slot.start, tz).day)}</span> v {formatTime(slot.start, tz)}
                    </p>
                    <p className="flex items-center gap-2.5">
                      <User className="size-4 text-accent" /> {salon.staff.find((m) => m.id === slot.staffId)?.name}
                    </p>
                    {location && (location.street || location.city) && (
                      <p className="flex items-center gap-2.5">
                        <MapPin className="size-4 text-accent" /> {[location.street, location.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {chosen.map((service) => {
                      const staff = salon.staff.find((m) => m.id === slot.staffId);
                      const override = staff?.services[service.id];
                      return (
                        <div key={service.id} className="flex justify-between gap-3 p-3 text-sm">
                          <span>{service.name}</span>
                          <span className="font-medium">{czk(override?.price ?? service.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {salon.loyalty && (
                    <p className="flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm text-accent">
                      <Sparkles className="size-4 shrink-0" /> Za tuto návštěvu získáte razítko věrnostního programu.
                    </p>
                  )}
                </Card>
                {!ready ? (
                  <Skeleton className="h-40 rounded-2xl" />
                ) : !user ? (
                  <InlineAuth next={`/s/${salon.slug}/rezervace`} onBeforeRedirect={saveDraft} title="Pro dokončení se přihlaste" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-fg-muted">
                      <Badge tone="success" dot>
                        Přihlášeno
                      </Badge>
                      {user.email}
                    </div>
                    <Field label="Vzkaz pro salon" hint="Nepovinné">
                      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Například alergie nebo speciální přání" maxLength={500} />
                    </Field>
                    <p className="text-xs text-fg-subtle">
                      Odesláním souhlasíte s <Link href="/pravni/podminky" className="underline">podmínkami</Link> a <Link href="/pravni/soukromi" className="underline">zpracováním osobních údajů</Link>.
                      {location?.settings && location.settings.cancel_deadline_h > 0 ? ` Zdarma lze zrušit nejpozději ${location.settings.cancel_deadline_h} h předem.` : ""}
                    </p>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 p-3">
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={prevStep} aria-label="Zpět" className="px-4">
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            {selected.length > 0 ? (
              <>
                <p className="truncate text-sm font-semibold">{czk(totals.price)}</p>
                <p className="truncate text-xs text-fg-muted">
                  {chosen.length} {chosen.length === 1 ? "služba" : chosen.length < 5 ? "služby" : "služeb"} · {durationLabel(totals.duration)}
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-muted">Vyberte alespoň jednu službu</p>
            )}
          </div>
          {step < 3 ? (
            <Button size="lg" disabled={!canContinue} onClick={nextStep} trailing={<ArrowRight className="size-5" />} style={canContinue ? { background: accent } : undefined}>
              Pokračovat
            </Button>
          ) : (
            <Button size="lg" disabled={!user || !slot} loading={busy} onClick={confirm} style={{ background: accent }}>
              Potvrdit rezervaci
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Waitlist({ salon, locationId, services, staffId, user, onBeforeRedirect }: { salon: PublicSalon; locationId: string; services: string[]; staffId: string; user: boolean; onBeforeRedirect: () => void }) {
  const toast = useToast();
  const [window_, setWindow] = useState<(typeof windows)[number]["value"]>("any");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function join() {
    setBusy(true);
    const picked = windows.find((w) => w.value === window_)!;
    const from = addDays(todayLocal(salon.timezone), 1);
    const { error } = await getSupabase().rpc("customer_join_waitlist", {
      p_location: locationId,
      p_service_ids: services,
      p_staff: (staffId === "any" ? null : staffId) as string,
      p_from: from,
      p_to: addDays(from, 21),
      p_time_from: picked.from ?? undefined,
      p_time_to: picked.to ?? undefined,
    });
    setBusy(false);
    if (error) {
      toast.error("Nepodařilo se přidat na čekací listinu", errorMessage(error));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="grid gap-2 p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <Check className="size-6" />
        </span>
        <p className="font-semibold">Hlídáme to pro vás</p>
        <p className="text-sm text-fg-muted">Jakmile se uvolní vyhovující termín, pošleme vám e-mail nebo upozornění.</p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
          <BellRing className="size-5" />
        </span>
        <div>
          <p className="font-semibold">Žádný volný termín</p>
          <p className="text-sm text-fg-muted">V nejbližších dnech je plno. Pošleme vám upozornění, až se nějaký termín uvolní.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {windows.map((w) => (
          <button key={w.value} onClick={() => setWindow(w.value)} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${window_ === w.value ? "border-transparent bg-accent text-white" : "border-border bg-surface hover:bg-surface-2"}`}>
            {w.label}
          </button>
        ))}
      </div>
      {user ? (
        <Button loading={busy} onClick={join} leading={<BellRing className="size-4" />}>
          Dejte mi vědět
        </Button>
      ) : (
        <InlineAuth next={`/s/${salon.slug}/rezervace`} onBeforeRedirect={onBeforeRedirect} title="Přihlaste se pro hlídání termínu" />
      )}
    </Card>
  );
}
