"use client";

import { weekdayNames } from "@repo/copy";
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, Field, Input, Select, Skeleton, Switch, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb } from "@/lib/data";
import { timeToMinutes } from "@/lib/time";

interface Interval {
  start: string;
  end: string;
}

export function LocationsSettings() {
  const { salon, locations, limits, can } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const router = useRouter();
  const editable = can(["owner", "manager"]);
  const [selected, setSelected] = useState(locations[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const slug = newName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `pobocka-${locations.length + 1}`;
      const { data, error } = await sb.from("locations").insert({ salon_id: salon.id, name: newName.trim(), slug }).select("id").single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      const settings = await sb.from("location_booking_settings").insert({ location_id: id, salon_id: salon.id });
      if (settings.error) throw settings.error;
      return id;
    },
    onSuccess: (id) => {
      toast.success("Pobočka přidána");
      setAddOpen(false);
      setNewName("");
      setSelected(id);
      router.refresh();
    },
    onError: (error) => toast.error("Pobočku se nepodařilo přidat", errorMessage(error)),
  });

  const atLimit = locations.length >= limits.locations;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {locations.map((location) => (
          <button key={location.id} type="button" onClick={() => setSelected(location.id)} className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all", selected === location.id ? "border-transparent bg-[image:var(--gradient-brand)] text-white shadow-glow" : "border-border bg-surface hover:border-border-strong")}>
            <Building className="h-4 w-4" /> {location.name}
          </button>
        ))}
        {editable && (
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} disabled={atLimit} leading={<Plus className="h-4 w-4" />}>
            Nová pobočka
          </Button>
        )}
        {atLimit && <Badge tone="warning">Limit tarifu: {limits.locations}</Badge>}
      </div>

      {selected && <LocationEditor key={selected} locationId={selected} editable={editable} />}

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Nová pobočka"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Zrušit
            </Button>
            <Button loading={add.isPending} disabled={!newName.trim()} onClick={() => add.mutate()}>
              Přidat
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field label="Název pobočky">
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Např. Praha Vinohrady" autoFocus />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function LocationEditor({ locationId, editable }: { locationId: string; editable: boolean }) {
  const { salon } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();

  const data = useQuery({
    queryKey: ["location-settings", locationId],
    queryFn: async () => {
      const [loc, hours, settings] = await Promise.all([
        sb.from("locations").select("*").eq("id", locationId).single(),
        sb.from("location_hours").select("weekday,opens,closes").eq("location_id", locationId).order("opens"),
        sb.from("location_booking_settings").select("*").eq("location_id", locationId).maybeSingle(),
      ]);
      return { loc: loc.data as any, hours: (hours.data ?? []) as { weekday: number; opens: string; closes: string }[], settings: settings.data as any };
    },
  });

  const [info, setInfo] = useState({ name: "", street: "", city: "", zip: "", phone: "" });
  const [week, setWeek] = useState<Record<number, Interval[]>>({});
  const [rules, setRules] = useState({ slot: "15", notice: "60", advance: "90", deadline: "24", mode: "auto", hold: "10" });

  useEffect(() => {
    if (!data.data) return;
    const { loc, hours, settings } = data.data;
    setInfo({ name: loc.name ?? "", street: loc.address_street ?? "", city: loc.address_city ?? "", zip: loc.address_zip ?? "", phone: loc.phone ?? "" });
    const next: Record<number, Interval[]> = {};
    for (const h of hours) (next[h.weekday] ??= []).push({ start: h.opens.slice(0, 5), end: h.closes.slice(0, 5) });
    setWeek(next);
    if (settings) setRules({ slot: String(settings.slot_interval_min), notice: String(settings.min_notice_min), advance: String(settings.max_advance_days), deadline: String(settings.cancel_deadline_h), mode: settings.confirmation_mode, hold: String(settings.hold_minutes) });
  }, [data.data]);

  const save = useMutation({
    mutationFn: async () => {
      const a = await sb.from("locations").update({ name: info.name.trim(), address_street: info.street || null, address_city: info.city || null, address_zip: info.zip || null, phone: info.phone || null }).eq("id", locationId);
      if (a.error) throw a.error;
      const del = await sb.from("location_hours").delete().eq("location_id", locationId);
      if (del.error) throw del.error;
      const rows = Object.entries(week).flatMap(([weekday, intervals]) => intervals.filter((i) => timeToMinutes(i.end) > timeToMinutes(i.start)).map((i) => ({ salon_id: salon.id, location_id: locationId, weekday: Number(weekday), opens: i.start, closes: i.end })));
      if (rows.length) {
        const ins = await sb.from("location_hours").insert(rows);
        if (ins.error) throw ins.error;
      }
      const s = await sb.from("location_booking_settings").upsert({ location_id: locationId, salon_id: salon.id, slot_interval_min: Number(rules.slot), min_notice_min: Number(rules.notice), max_advance_days: Number(rules.advance), cancel_deadline_h: Number(rules.deadline), confirmation_mode: rules.mode, hold_minutes: Number(rules.hold) }, { onConflict: "location_id" });
      if (s.error) throw s.error;
    },
    onSuccess: () => {
      toast.success("Pobočka uložena");
      qc.invalidateQueries({ queryKey: ["location-settings"] });
      router.refresh();
    },
    onError: (error) => toast.error("Uložení se nepodařilo", errorMessage(error)),
  });

  if (data.isLoading) return <Skeleton className="h-96 rounded-lg" />;
  const set = (key: keyof typeof info, value: string) => setInfo({ ...info, [key]: value });
  const change = (weekday: number, next: Interval[]) => setWeek({ ...week, [weekday]: next });

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Adresa pobočky" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Název" className="sm:col-span-2">
            <Input value={info.name} onChange={(event) => set("name", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Ulice a číslo" className="sm:col-span-2">
            <Input value={info.street} onChange={(event) => set("street", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Město">
            <Input value={info.city} onChange={(event) => set("city", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="PSČ">
            <Input value={info.zip} onChange={(event) => set("zip", event.target.value)} disabled={!editable} />
          </Field>
          <Field label="Telefon pobočky">
            <Input type="tel" value={info.phone} onChange={(event) => set("phone", event.target.value)} disabled={!editable} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Otevírací doba" description="Zobrazuje se zákazníkům. Dostupnost pracovníků se nastavuje zvlášť v jejich pracovní době." />
        <div className="grid gap-2 p-5">
          {weekdayNames.map((label, index) => {
            const weekday = index + 1;
            const intervals = week[weekday] ?? [];
            return (
              <div key={weekday} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                <div className="flex w-32 shrink-0 items-center gap-2.5">
                  <Checkbox checked={intervals.length > 0} disabled={!editable} onChange={(on) => change(weekday, on ? [{ start: "09:00", end: "17:00" }] : [])} />
                  <span className={cn("text-sm font-medium", !intervals.length && "text-fg-subtle")}>{label}</span>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {intervals.length === 0 && <span className="text-sm text-fg-subtle">Zavřeno</span>}
                  {intervals.map((interval, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input type="time" value={interval.start} disabled={!editable} onChange={(event) => change(weekday, intervals.map((x, j) => (j === i ? { ...x, start: event.target.value } : x)))} inputSize="sm" className="w-28" />
                      <span className="text-fg-subtle">–</span>
                      <Input type="time" value={interval.end} disabled={!editable} onChange={(event) => change(weekday, intervals.map((x, j) => (j === i ? { ...x, end: event.target.value } : x)))} inputSize="sm" className="w-28" />
                      {editable && (
                        <button type="button" onClick={() => change(weekday, intervals.filter((_, j) => j !== i))} className="rounded-sm p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label="Odebrat">
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
      </Card>

      <Card>
        <CardHeader title="Pravidla online rezervace" description="Platí pro tuto pobočku." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Krok mezi termíny">
            <Select value={rules.slot} disabled={!editable} onChange={(event) => setRules({ ...rules, slot: event.target.value })}>
              {[5, 10, 15, 20, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v} minut
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nejkratší předstih rezervace">
            <Select value={rules.notice} disabled={!editable} onChange={(event) => setRules({ ...rules, notice: event.target.value })}>
              {[[0, "Ihned"], [30, "30 minut"], [60, "1 hodina"], [120, "2 hodiny"], [240, "4 hodiny"], [720, "12 hodin"], [1440, "1 den"]].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jak daleko dopředu lze rezervovat">
            <Select value={rules.advance} disabled={!editable} onChange={(event) => setRules({ ...rules, advance: event.target.value })}>
              {[14, 30, 60, 90, 180, 365].map((v) => (
                <option key={v} value={v}>
                  {v} dní
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Storno bez sankce do" hint="Po této lhůtě už klient online nezruší">
            <Select value={rules.deadline} disabled={!editable} onChange={(event) => setRules({ ...rules, deadline: event.target.value })}>
              {[0, 2, 6, 12, 24, 48, 72].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Kdykoli" : `${v} hodin před termínem`}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Potvrzovat rezervace ručně</p>
              <p className="text-xs text-fg-muted">Nové online rezervace budou čekat na váš souhlas. Jinak se potvrdí automaticky.</p>
            </div>
            <Switch checked={rules.mode === "manual"} disabled={!editable} onCheckedChange={(on) => setRules({ ...rules, mode: on ? "manual" : "auto" })} label="Ruční potvrzování" />
          </div>
        </div>
      </Card>

      {editable && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" loading={save.isPending} onClick={() => save.mutate()} leading={<Save className="h-[18px] w-[18px]" />} className="shadow-lg">
            Uložit pobočku
          </Button>
        </div>
      )}
    </div>
  );
}
