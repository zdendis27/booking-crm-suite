"use client";

import { weekdayNames } from "@repo/copy";
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, DatePicker, Dialog, EmptyState, Field, Input, Select, Skeleton, Switch, Tabs, Textarea, addDays, cn, todayISO, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Copy, LogIn, LogOut, Palmtree, Plus, Save, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/app/feature-gate";
import { useSalon } from "@/components/app/salon-context";
import { czk, percent } from "@/lib/format";
import { errorMessage, useServices, useSb, useStaff, type StaffRow } from "@/lib/data";
import { formatDateTime, localToISO, timeToMinutes } from "@/lib/time";
import type { Snapshot } from "@/lib/types";

type Tab = "profile" | "hours" | "services" | "commissions" | "attendance" | "performance";
const palette = ["#3056d3", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6"];

export function StaffDetail({ staffId }: { staffId: string }) {
  const { salon, can, hasFeature } = useSalon();
  const staffQuery = useStaff(true);
  const [tab, setTab] = useState<Tab>("profile");
  const isMgmt = can(["owner", "manager"]);
  const staff = (staffQuery.data ?? []).find((s) => s.id === staffId);

  if (staffQuery.isLoading) return <Skeleton className="h-96 rounded-lg" />;
  if (!staff) return <EmptyState icon={Clock} title="Pracovník nenalezen" />;

  return (
    <div>
      <Link href={`/app/${salon.slug}/tym`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Celý tým
      </Link>
      <Card className="relative mb-6 overflow-hidden">
        <div className="h-24" style={{ background: `linear-gradient(135deg, ${staff.color}, color-mix(in srgb, ${staff.color} 55%, #06b6d4))` }} />
        <div className="-mt-10 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-6">
          <span className="rounded-full ring-4 ring-surface">
            <Avatar name={staff.display_name} color={staff.color} size={80} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{staff.display_name}</h1>
            <p className="text-fg-muted">{staff.title ?? "Pracovník"}</p>
          </div>
          <div className="flex gap-2">
            {staff.archived_at ? <Badge tone="warning">Archivován</Badge> : staff.bookable ? <Badge tone="success" dot>Rezervovatelný</Badge> : <Badge>Skrytý</Badge>}
          </div>
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: "profile", label: "Profil" },
          { value: "hours", label: "Pracovní doba" },
          { value: "services", label: "Služby a ceny" },
          ...(isMgmt ? [{ value: "commissions" as Tab, label: "Provize" }] : []),
          { value: "attendance", label: "Docházka" },
          ...(isMgmt ? [{ value: "performance" as Tab, label: "Výkon" }] : []),
        ]}
      />

      {tab === "profile" && <ProfilePanel staff={staff} editable={isMgmt} />}
      {tab === "hours" && <HoursPanel staff={staff} editable={isMgmt || can(["reception"])} />}
      {tab === "services" && <ServicesPanel staff={staff} editable={isMgmt} />}
      {tab === "commissions" && (hasFeature("commissions") ? <CommissionsPanel staff={staff} /> : <FeatureGate feature="commissions">{null}</FeatureGate>)}
      {tab === "attendance" && <AttendancePanel staff={staff} />}
      {tab === "performance" && <PerformancePanel staff={staff} />}
    </div>
  );
}

function ProfilePanel({ staff, editable }: { staff: StaffRow; editable: boolean }) {
  const { salon, locations } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(staff.display_name);
  const [title, setTitle] = useState(staff.title ?? "");
  const [bio, setBio] = useState(staff.bio ?? "");
  const [color, setColor] = useState(staff.color);
  const [bookable, setBookable] = useState(staff.bookable);
  const [locs, setLocs] = useState(staff.locations);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("staff").update({ display_name: name.trim(), title: title.trim() || null, bio: bio.trim() || null, color, bookable }).eq("id", staff.id);
      if (error) throw error;
      const toAdd = locs.filter((id) => !staff.locations.includes(id));
      const toRemove = staff.locations.filter((id) => !locs.includes(id));
      if (toAdd.length) {
        const { error: e } = await sb.from("staff_locations").insert(toAdd.map((location_id) => ({ staff_id: staff.id, location_id, salon_id: salon.id })));
        if (e) throw e;
      }
      if (toRemove.length) {
        const { error: e } = await sb.from("staff_locations").delete().eq("staff_id", staff.id).in("location_id", toRemove);
        if (e) throw e;
      }
    },
    onSuccess: () => {
      toast.success("Profil uložen");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("staff").update({ archived_at: staff.archived_at ? null : new Date().toISOString() }).eq("id", staff.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      if (!staff.archived_at) router.push(`/app/${salon.slug}/tym`);
    },
    onError: (error) => toast.error("Akce se nepovedla", errorMessage(error)),
  });

  return (
    <Card className="max-w-3xl">
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Jméno" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!editable} />
        </Field>
        <Field label="Pozice">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!editable} />
        </Field>
        <Field label="Představení na webu" className="sm:col-span-2">
          <Textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} disabled={!editable} />
        </Field>
        <Field label="Barva v kalendáři">
          <div className="flex flex-wrap gap-2">
            {palette.map((value) => (
              <button key={value} type="button" disabled={!editable} onClick={() => setColor(value)} className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition-all", color === value && "ring-2 ring-accent")} style={{ background: value }} aria-label={value} />
            ))}
          </div>
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
          <div>
            <p className="text-sm font-medium">Rezervovatelný online</p>
            <p className="text-xs text-fg-muted">Zákazníci ho uvidí ve výběru</p>
          </div>
          <Switch checked={bookable} onCheckedChange={setBookable} disabled={!editable} label="Rezervovatelný" />
        </div>
        {locations.length > 1 && (
          <Field label="Pobočky" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => setLocs((current) => (current.includes(location.id) ? current.filter((id) => id !== location.id) : [...current, location.id]))}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", locs.includes(location.id) ? "border-accent bg-accent-soft text-accent" : "border-border")}
                >
                  {location.name}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
      {editable && (
        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={() => archive.mutate()} loading={archive.isPending}>
            {staff.archived_at ? "Obnovit pracovníka" : "Archivovat pracovníka"}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} leading={<Save className="h-4 w-4" />}>
            Uložit
          </Button>
        </div>
      )}
    </Card>
  );
}

interface Interval {
  start: string;
  end: string;
}

function HoursPanel({ staff, editable }: { staff: StaffRow; editable: boolean }) {
  const { salon, locations, locationId } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const [location, setLocation] = useState(staff.locations.includes(locationId) ? locationId : (staff.locations[0] ?? locationId));
  const [week, setWeek] = useState<Record<number, Interval[]>>({});
  const [dirty, setDirty] = useState(false);

  const schedule = useQuery({
    queryKey: ["staff-schedule", staff.id, location],
    queryFn: async () => {
      const { data } = await sb.from("staff_schedules").select("weekday,starts,ends").eq("staff_id", staff.id).eq("location_id", location).order("starts");
      return (data ?? []) as { weekday: number; starts: string; ends: string }[];
    },
  });

  useEffect(() => {
    const next: Record<number, Interval[]> = {};
    for (const row of schedule.data ?? []) {
      (next[row.weekday] ??= []).push({ start: row.starts.slice(0, 5), end: row.ends.slice(0, 5) });
    }
    setWeek(next);
    setDirty(false);
  }, [schedule.data]);

  const today = todayISO(salon.timezone);
  const off = useQuery({
    queryKey: ["staff-off", staff.id],
    queryFn: async () => {
      const [timeOff, overrides] = await Promise.all([
        sb.from("staff_time_off").select("id,during,kind,note").eq("staff_id", staff.id).order("created_at", { ascending: false }).limit(40),
        sb.from("staff_schedule_overrides").select("id,day,kind,starts,ends,location_id").eq("staff_id", staff.id).gte("day", today).order("day"),
      ]);
      return { timeOff: (timeOff.data ?? []) as { id: string; during: string; kind: string; note: string | null }[], overrides: (overrides.data ?? []) as { id: string; day: string; kind: string; starts: string | null; ends: string | null }[] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const del = await sb.from("staff_schedules").delete().eq("staff_id", staff.id).eq("location_id", location);
      if (del.error) throw del.error;
      const rows = Object.entries(week).flatMap(([weekday, intervals]) =>
        intervals.filter((i) => i.start && i.end && timeToMinutes(i.end) > timeToMinutes(i.start)).map((i) => ({ salon_id: salon.id, staff_id: staff.id, location_id: location, weekday: Number(weekday), starts: i.start, ends: i.end })),
      );
      if (rows.length) {
        const { error } = await sb.from("staff_schedules").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Pracovní doba uložena");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["staff-schedule"] });
      qc.invalidateQueries({ queryKey: ["schedule-data"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  function change(weekday: number, next: Interval[]) {
    setWeek({ ...week, [weekday]: next });
    setDirty(true);
  }

  function copyToWeekdays() {
    const source = week[1] ?? [];
    setWeek({ ...week, 2: source, 3: source, 4: source, 5: source });
    setDirty(true);
  }

  const [offOpen, setOffOpen] = useState(false);
  const [offKind, setOffKind] = useState("vacation");
  const [offFrom, setOffFrom] = useState(today);
  const [offTo, setOffTo] = useState(today);
  const [offNote, setOffNote] = useState("");
  const addOff = useMutation({
    mutationFn: async () => {
      const from = localToISO(offFrom, "00:00", salon.timezone);
      const to = localToISO(addDays(offTo, 1), "00:00", salon.timezone);
      const { error } = await sb.from("staff_time_off").insert({ salon_id: salon.id, staff_id: staff.id, during: `[${from},${to})`, kind: offKind, note: offNote || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Volno zapsáno");
      setOffOpen(false);
      setOffNote("");
      qc.invalidateQueries({ queryKey: ["staff-off"] });
      qc.invalidateQueries({ queryKey: ["schedule-data"] });
    },
    onError: (error) => toast.error("Volno se nepodařilo zapsat", errorMessage(error)),
  });
  const removeOff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("staff_time_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-off"] });
      qc.invalidateQueries({ queryKey: ["schedule-data"] });
    },
  });

  const [extraOpen, setExtraOpen] = useState(false);
  const [extraDay, setExtraDay] = useState(today);
  const [extraKind, setExtraKind] = useState("off");
  const [extraFrom, setExtraFrom] = useState("09:00");
  const [extraTo, setExtraTo] = useState("13:00");
  const addExtra = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("staff_schedule_overrides").insert({
        salon_id: salon.id,
        staff_id: staff.id,
        location_id: location,
        day: extraDay,
        kind: extraKind,
        starts: extraKind === "extra" ? extraFrom : null,
        ends: extraKind === "extra" ? extraTo : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setExtraOpen(false);
      qc.invalidateQueries({ queryKey: ["staff-off"] });
      qc.invalidateQueries({ queryKey: ["schedule-data"] });
    },
    onError: (error) => toast.error("Výjimku se nepodařilo uložit", errorMessage(error)),
  });
  const removeExtra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("staff_schedule_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-off"] }),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader
          title="Týdenní pracovní doba"
          description="Pauzy zadejte jako dva časové úseky (např. 9–12 a 13–17)."
          action={
            locations.length > 1 && (
              <div className="w-44">
                <Select value={location} onChange={(event) => setLocation(event.target.value)} aria-label="Pobočka">
                  {locations.filter((l) => staff.locations.includes(l.id)).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
            )
          }
        />
        <div className="grid gap-2 p-5">
          {weekdayNames.map((label, index) => {
            const weekday = index + 1;
            const intervals = week[weekday] ?? [];
            return (
              <div key={weekday} className={cn("flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center", intervals.length ? "border-border" : "border-dashed border-border bg-surface-2/40")}>
                <div className="flex w-28 shrink-0 items-center gap-2.5">
                  <Checkbox checked={intervals.length > 0} disabled={!editable} onChange={(on) => change(weekday, on ? [{ start: "09:00", end: "17:00" }] : [])} />
                  <span className={cn("text-sm font-medium", !intervals.length && "text-fg-subtle")}>{label}</span>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {intervals.length === 0 && <span className="text-sm text-fg-subtle">Nepracuje</span>}
                  {intervals.map((interval, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input type="time" value={interval.start} disabled={!editable} onChange={(event) => change(weekday, intervals.map((x, j) => (j === i ? { ...x, start: event.target.value } : x)))} inputSize="sm" className="w-28" />
                      <span className="text-fg-subtle">–</span>
                      <Input type="time" value={interval.end} disabled={!editable} onChange={(event) => change(weekday, intervals.map((x, j) => (j === i ? { ...x, end: event.target.value } : x)))} inputSize="sm" className="w-28" />
                      {editable && (
                        <button type="button" onClick={() => change(weekday, intervals.filter((_, j) => j !== i))} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Odebrat úsek">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {editable && intervals.length > 0 && (
                    <button type="button" onClick={() => change(weekday, [...intervals, { start: "13:00", end: "17:00" }])} className="rounded-sm p-1.5 text-accent hover:bg-accent-soft" aria-label="Přidat úsek">
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {editable && (
          <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-5 py-4">
            <Button variant="ghost" size="sm" onClick={copyToWeekdays} leading={<Copy className="h-4 w-4" />}>
              Pondělí na všední dny
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty} leading={<Save className="h-4 w-4" />}>
              Uložit
            </Button>
          </div>
        )}
      </Card>

      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Dovolená a blokace" action={editable && <Button size="xs" variant="secondary" onClick={() => setOffOpen(true)} leading={<Plus className="h-3.5 w-3.5" />}>Přidat</Button>} />
          <ul className="divide-y divide-border p-2">
            {(off.data?.timeOff ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Žádné naplánované volno.</li>}
            {(off.data?.timeOff ?? []).map((row) => {
              const match = /^[\[(]"?([^",]+)"?,\s*"?([^")\]]+)"?[\])]$/.exec(row.during);
              const from = match ? new Date(match[1]!.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")) : null;
              const to = match ? new Date(new Date(match[2]!.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).getTime() - 1) : null;
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-warning-soft text-warning">
                    <Palmtree className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{row.note || (row.kind === "vacation" ? "Dovolená" : row.kind === "sick" ? "Nemoc" : "Blokace")}</span>
                    <span className="text-xs text-fg-subtle">{from && to ? `${from.toLocaleDateString("cs-CZ", { timeZone: salon.timezone })} – ${to.toLocaleDateString("cs-CZ", { timeZone: salon.timezone })}` : row.during}</span>
                  </span>
                  {editable && (
                    <button type="button" onClick={() => removeOff.mutate(row.id)} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Jednorázové výjimky" description="Volný den nebo mimořádná směna" action={editable && <Button size="xs" variant="secondary" onClick={() => setExtraOpen(true)} leading={<Plus className="h-3.5 w-3.5" />}>Přidat</Button>} />
          <ul className="divide-y divide-border p-2">
            {(off.data?.overrides ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Žádné výjimky.</li>}
            {(off.data?.overrides ?? []).map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{new Date(`${row.day}T00:00:00Z`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" })}</span>
                  <span className="text-xs text-fg-subtle">{row.kind === "off" ? "Celý den volno" : `Mimořádně ${row.starts?.slice(0, 5)}–${row.ends?.slice(0, 5)}`}</span>
                </span>
                {editable && (
                  <button type="button" onClick={() => removeExtra.mutate(row.id)} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Dialog
        open={offOpen}
        onOpenChange={setOffOpen}
        title="Přidat volno"
        description="V tomto období nepůjde pracovníka rezervovat."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOffOpen(false)}>
              Zrušit
            </Button>
            <Button loading={addOff.isPending} onClick={() => addOff.mutate()}>
              Zapsat
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Typ">
            <Select value={offKind} onChange={(event) => setOffKind(event.target.value)}>
              <option value="vacation">Dovolená</option>
              <option value="sick">Nemoc</option>
              <option value="block">Blokace termínu</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Od">
              <DatePicker value={offFrom} onChange={(value) => { setOffFrom(value); if (offTo < value) setOffTo(value); }} />
            </Field>
            <Field label="Do (včetně)">
              <DatePicker value={offTo} onChange={setOffTo} min={offFrom} />
            </Field>
          </div>
          <Field label="Poznámka">
            <Input value={offNote} onChange={(event) => setOffNote(event.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        title="Jednorázová výjimka"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtraOpen(false)}>
              Zrušit
            </Button>
            <Button loading={addExtra.isPending} onClick={() => addExtra.mutate()}>
              Uložit
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Den">
            <DatePicker value={extraDay} onChange={setExtraDay} min={today} />
          </Field>
          <Field label="Typ">
            <Select value={extraKind} onChange={(event) => setExtraKind(event.target.value)}>
              <option value="off">Celý den volno</option>
              <option value="extra">Mimořádná směna</option>
            </Select>
          </Field>
          {extraKind === "extra" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Od">
                <Input type="time" value={extraFrom} onChange={(event) => setExtraFrom(event.target.value)} />
              </Field>
              <Field label="Do">
                <Input type="time" value={extraTo} onChange={(event) => setExtraTo(event.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function ServicesPanel({ staff, editable }: { staff: StaffRow; editable: boolean }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const services = useServices();
  const [state, setState] = useState<Record<string, { on: boolean; price: string; duration: string }>>({});

  useEffect(() => {
    const next: typeof state = {};
    for (const service of services.data?.services ?? []) {
      const override = staff.services[service.id];
      next[service.id] = { on: !!override, price: override?.price_override != null ? String(override.price_override / 100) : "", duration: override?.duration_override != null ? String(override.duration_override) : "" };
    }
    setState(next);
  }, [services.data, staff.services]);

  const save = useMutation({
    mutationFn: async () => {
      const del = await sb.from("staff_services").delete().eq("staff_id", staff.id);
      if (del.error) throw del.error;
      const rows = Object.entries(state)
        .filter(([, v]) => v.on)
        .map(([service_id, v]) => ({
          staff_id: staff.id,
          service_id,
          salon_id: salon.id,
          price_override: v.price.trim() ? Math.round(Number(v.price.replace(",", ".")) * 100) : null,
          duration_override: v.duration.trim() ? Number(v.duration) : null,
        }));
      if (rows.length) {
        const { error } = await sb.from("staff_services").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Služby a ceny uloženy");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  const list = services.data?.services ?? [];
  return (
    <Card>
      <CardHeader title="Služby, které pracovník dělá" description="Můžete nastavit vlastní cenu a délku. Prázdné pole použije výchozí hodnotu služby." />
      <div className="overflow-x-auto p-2">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-3 py-2 font-medium">Služba</th>
              <th className="px-3 py-2 font-medium">Výchozí</th>
              <th className="px-3 py-2 font-medium">Vlastní cena (Kč)</th>
              <th className="px-3 py-2 font-medium">Vlastní délka (min)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((service) => {
              const row = state[service.id] ?? { on: false, price: "", duration: "" };
              return (
                <tr key={service.id} className="border-t border-border">
                  <td className="px-3 py-3">
                    <Checkbox checked={row.on} disabled={!editable} onChange={(on) => setState({ ...state, [service.id]: { ...row, on } })} label={<span className="font-medium">{service.name}</span>} />
                  </td>
                  <td className="px-3 py-3 text-fg-muted tabular">
                    {czk(service.price)} · {service.duration_min} min
                  </td>
                  <td className="px-3 py-3">
                    <Input inputSize="sm" inputMode="decimal" className="w-28" disabled={!row.on || !editable} value={row.price} placeholder={String(service.price / 100)} onChange={(event) => setState({ ...state, [service.id]: { ...row, price: event.target.value } })} />
                  </td>
                  <td className="px-3 py-3">
                    <Input inputSize="sm" type="number" className="w-24" disabled={!row.on || !editable} value={row.duration} placeholder={String(service.duration_min)} onChange={(event) => setState({ ...state, [service.id]: { ...row, duration: event.target.value } })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex justify-end border-t border-border bg-surface-2/50 px-5 py-4">
          <Button onClick={() => save.mutate()} loading={save.isPending} leading={<Save className="h-4 w-4" />}>
            Uložit
          </Button>
        </div>
      )}
    </Card>
  );
}

function CommissionsPanel({ staff }: { staff: StaffRow }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const services = useServices();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [target, setTarget] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("40");

  const rules = useQuery({
    queryKey: ["commission-rules", staff.id],
    queryFn: async () => {
      const [staffRules, salonRules, settings, entries, payouts] = await Promise.all([
        sb.from("staff_commission_rules").select("*").eq("salon_id", salon.id).eq("staff_id", staff.id).order("created_at"),
        sb.from("staff_commission_rules").select("*").eq("salon_id", salon.id).is("staff_id", null).order("created_at"),
        sb.from("salon_commission_settings").select("*").eq("salon_id", salon.id).maybeSingle(),
        sb.from("commission_entries").select("id,amount,base_amount,description,earned_on,payout_id").eq("staff_id", staff.id).order("earned_on", { ascending: false }).limit(200),
        sb.from("commission_payouts").select("id,period_from,period_to,total,status,paid_at").eq("staff_id", staff.id).order("created_at", { ascending: false }).limit(10),
      ]);
      return { staffRules: (staffRules.data ?? []) as any[], salonRules: (salonRules.data ?? []) as any[], settings: settings.data as any, entries: (entries.data ?? []) as any[], payouts: (payouts.data ?? []) as any[] };
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { salon_id: salon.id, staff_id: staff.id, scope, type, percent: type === "percent" ? Number(value) : null, fixed_amount: type === "fixed" ? Math.round(Number(value) * 100) : null };
      if (scope === "service") payload.service_id = target;
      if (scope === "category") payload.category_id = target;
      const { error } = await sb.from("staff_commission_rules").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["commission-rules"] });
    },
    onError: (error) => toast.error("Pravidlo se nepodařilo uložit", errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("staff_commission_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-rules"] }),
  });

  const payout = useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("create_commission_payout", { p_staff: staff.id, p_from: "2000-01-01", p_to: "2100-01-01" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Výplata vytvořena");
      qc.invalidateQueries({ queryKey: ["commission-rules"] });
    },
    onError: (error) => toast.error("Výplatu se nepodařilo vytvořit", errorMessage(error)),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("mark_payout_paid", { p_payout: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-rules"] }),
  });

  const unpaid = (rules.data?.entries ?? []).filter((e) => !e.payout_id).reduce((sum, e) => sum + Number(e.amount), 0);
  const thisMonth = (rules.data?.entries ?? []).filter((e) => e.earned_on.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((sum, e) => sum + Number(e.amount), 0);

  function describeRule(rule: any) {
    const scopeLabel = rule.scope === "all" ? "Všechny služby" : rule.scope === "service" ? `Služba: ${(services.data?.services ?? []).find((s) => s.id === rule.service_id)?.name ?? ""}` : rule.scope === "category" ? `Kategorie: ${(services.data?.categories ?? []).find((c) => c.id === rule.category_id)?.name ?? ""}` : "Produkt";
    return { scopeLabel, valueLabel: rule.type === "percent" ? `${Number(rule.percent)} %` : rule.type === "fixed" ? czk(Number(rule.fixed_amount)) : "Bez provize" };
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid content-start gap-5">
        <Card>
          <CardHeader title="Pravidla provizí" description={`Základ výpočtu: ${rules.data?.settings?.base_mode === "net_after_discount" ? "cena bez DPH po slevě" : rules.data?.settings?.base_mode === "gross_before_discount" ? "cena před slevou" : "cena po slevě"} · ${rules.data?.settings?.mode === "primary_staff" ? "vše hlavnímu pracovníkovi" : "po jednotlivých službách"}`} action={<Button size="xs" variant="secondary" onClick={() => setOpen(true)} leading={<Plus className="h-3.5 w-3.5" />}>Nové pravidlo</Button>} />
          <ul className="divide-y divide-border p-2">
            {(rules.data?.staffRules ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím žádná pravidla pracovníka. Použijí se obecná pravidla salonu.</li>}
            {(rules.data?.staffRules ?? []).map((rule) => {
              const d = describeRule(rule);
              return (
                <li key={rule.id} className="flex items-center gap-3 px-3 py-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{d.scopeLabel}</span>
                  <Badge tone="accent">{d.valueLabel}</Badge>
                  <button type="button" onClick={() => remove.mutate(rule.id)} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Smazat">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {(rules.data?.salonRules ?? []).length > 0 && (
            <div className="border-t border-border bg-surface-2/40 px-5 py-3 text-xs text-fg-muted">
              Obecná pravidla salonu: {(rules.data?.salonRules ?? []).map((r) => `${describeRule(r).scopeLabel} ${describeRule(r).valueLabel}`).join(", ")}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Poslední provize" />
          <ul className="max-h-96 divide-y divide-border overflow-y-auto p-2">
            {(rules.data?.entries ?? []).slice(0, 40).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-20 text-xs text-fg-subtle">{new Date(entry.earned_on).toLocaleDateString("cs-CZ")}</span>
                <span className="min-w-0 flex-1 truncate">{entry.description}</span>
                <span className="text-xs text-fg-subtle tabular">{czk(entry.base_amount)}</span>
                <span className="w-20 text-right font-semibold tabular">{czk(entry.amount)}</span>
                {entry.payout_id && <Badge tone="success">Vyplaceno</Badge>}
              </li>
            ))}
            {(rules.data?.entries ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Provize se počítají automaticky po dokončení návštěvy.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid content-start gap-5">
        <Card className="overflow-hidden">
          <div className="bg-[image:var(--gradient-brand)] p-5 text-white">
            <p className="text-sm text-white/80">K vyplacení</p>
            <p className="mt-1 text-3xl font-semibold tabular">{czk(unpaid)}</p>
            <p className="mt-1 text-sm text-white/80">Tento měsíc vzniklo {czk(thisMonth)}</p>
          </div>
          <div className="p-4">
            <Button className="w-full" disabled={unpaid <= 0} loading={payout.isPending} onClick={() => payout.mutate()}>
              Vytvořit výplatu
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Výplaty" />
          <ul className="divide-y divide-border p-2">
            {(rules.data?.payouts ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím žádné výplaty.</li>}
            {(rules.data?.payouts ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold tabular">{czk(p.total)}</span>
                  <span className="text-xs text-fg-subtle">{new Date(p.period_to).toLocaleDateString("cs-CZ")}</span>
                </span>
                {p.status === "paid" ? <Badge tone="success">Vyplaceno</Badge> : <Button size="xs" variant="soft" onClick={() => markPaid.mutate(p.id)}>Označit jako vyplacené</Button>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nové pravidlo provize"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button loading={add.isPending} disabled={!value || (scope !== "all" && !target)} onClick={() => add.mutate()}>
              Uložit
            </Button>
          </>
        }
      >
        <div className="grid gap-4 pb-2">
          <Field label="Platí pro">
            <Select value={scope} onChange={(event) => { setScope(event.target.value); setTarget(""); }}>
              <option value="all">Všechny služby</option>
              <option value="service">Konkrétní službu</option>
              <option value="category">Kategorii služeb</option>
            </Select>
          </Field>
          {scope === "service" && (
            <Field label="Služba">
              <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">Vyberte…</option>
                {(services.data?.services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {scope === "category" && (
            <Field label="Kategorie">
              <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">Vyberte…</option>
                {(services.data?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typ">
              <Select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="percent">Procento</option>
                <option value="fixed">Pevná částka</option>
              </Select>
            </Field>
            <Field label={type === "percent" ? "Procent" : "Částka (Kč)"}>
              <Input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function AttendancePanel({ staff }: { staff: StaffRow }) {
  const { salon, locationId, can, userId } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const allowed = can(["owner", "manager", "reception"]) || staff.user_id === userId;

  const log = useQuery({
    queryKey: ["attendance", staff.id],
    queryFn: async () => {
      const { data } = await sb.from("staff_attendance").select("id,clock_in,clock_out").eq("staff_id", staff.id).order("clock_in", { ascending: false }).limit(60);
      return (data ?? []) as { id: string; clock_in: string; clock_out: string | null }[];
    },
  });

  const open = (log.data ?? []).find((row) => !row.clock_out);
  const toggle = useMutation({
    mutationFn: async () => {
      const { error } = open ? await sb.rpc("clock_out", { p_staff: staff.id }) : await sb.rpc("clock_in", { p_staff: staff.id, p_location: locationId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(open ? "Odhlášeno z práce" : "Příchod zapsán");
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error) => toast.error("Docházku se nepodařilo zapsat", errorMessage(error)),
  });

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthMinutes = (log.data ?? []).filter((r) => r.clock_in.slice(0, 7) === monthKey && r.clock_out).reduce((sum, r) => sum + (Date.parse(r.clock_out!) - Date.parse(r.clock_in)) / 60000, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card className="h-fit overflow-hidden">
        <div className={cn("p-6 text-center", open ? "bg-success-soft" : "bg-surface-2/60")}>
          <div className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", open ? "bg-success text-white" : "bg-surface-3 text-fg-muted")}>
            <Clock className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-semibold">{open ? "V práci" : "Mimo práci"}</p>
          {open && <p className="text-sm text-fg-muted">od {formatDateTime(open.clock_in, salon.timezone)}</p>}
          {allowed && (
            <Button className="mt-4 w-full" size="lg" variant={open ? "secondary" : "primary"} loading={toggle.isPending} onClick={() => toggle.mutate()} leading={open ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}>
              {open ? "Odejít z práce" : "Příchod"}
            </Button>
          )}
        </div>
        <div className="border-t border-border p-4 text-center text-sm text-fg-muted">
          Tento měsíc odpracováno <span className="font-semibold text-fg tabular">{Math.floor(monthMinutes / 60)} h {Math.round(monthMinutes % 60)} min</span>
        </div>
      </Card>
      <Card>
        <CardHeader title="Historie docházky" />
        <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto p-2">
          {(log.data ?? []).length === 0 && <li className="p-4 text-sm text-fg-muted">Zatím žádné záznamy.</li>}
          {(log.data ?? []).map((row) => {
            const minutes = row.clock_out ? (Date.parse(row.clock_out) - Date.parse(row.clock_in)) / 60000 : null;
            return (
              <li key={row.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{formatDateTime(row.clock_in, salon.timezone)}</span>
                  <span className="text-xs text-fg-subtle">{row.clock_out ? `do ${formatDateTime(row.clock_out, salon.timezone)}` : "probíhá"}</span>
                </span>
                {minutes !== null && <Badge>{Math.floor(minutes / 60)} h {Math.round(minutes % 60)} min</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function PerformancePanel({ staff }: { staff: StaffRow }) {
  const { salon } = useSalon();
  const sb = useSb();
  const [range, setRange] = useState(30);
  const today = todayISO(salon.timezone);
  const snapshot = useQuery({
    queryKey: ["staff-performance", salon.id, range],
    queryFn: async () => {
      const { data, error } = await sb.rpc("owner_snapshot", { p_salon: salon.id, p_from: addDays(today, -range + 1), p_to: today });
      if (error) throw error;
      return data as Snapshot;
    },
  });
  const row = snapshot.data?.by_staff?.find((r) => r.staff_id === staff.id);
  const ratio = row && row.scheduled_min > 0 ? row.booked_min / row.scheduled_min : 0;
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[7, 30, 90].map((days) => (
          <button key={days} type="button" onClick={() => setRange(days)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all", range === days ? "border-transparent bg-[image:var(--gradient-brand)] text-white shadow-glow" : "border-border bg-surface")}>
            {days} dní
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Tržby", value: czk(row?.revenue ?? 0), icon: TrendingUp },
          { label: "Počet klientů", value: String(row?.clients ?? 0), icon: Clock },
          { label: "Rezervací", value: String(row?.bookings ?? 0), icon: Clock },
          { label: "Obsazenost", value: percent(ratio), icon: Clock },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-sm text-fg-muted">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{snapshot.isLoading ? "…" : item.value}</p>
          </Card>
        ))}
      </div>
      {row && (
        <p className="mt-4 text-sm text-fg-muted">
          Provize za období: <span className="font-semibold text-fg">{czk(row.commission)}</span>
        </p>
      )}
    </div>
  );
}
