"use client";

import { bookingSource } from "@repo/copy";
import { Avatar, Button, DatePicker, Dialog, Field, Input, Select, Textarea, cn, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ClientPicker } from "@/components/clients/client-picker";
import { useSalon } from "@/components/app/salon-context";
import { czk } from "@/lib/format";
import { errorMessage, useServices, useSb, useStaff, type ClientListRow, type ServiceRow, type StaffRow } from "@/lib/data";
import { durationLabel, formatTime, localToISO, todayLocal } from "@/lib/time";

interface Item {
  key: number;
  serviceId: string;
  staffId: string;
}

export interface BookingFormInitial {
  day?: string;
  time?: string;
  staffId?: string;
  client?: ClientListRow | null;
}

let counter = 0;

export function priceFor(service: ServiceRow, staff?: StaffRow) {
  const override = staff?.services[service.id];
  return { price: override?.price_override ?? service.price, duration: override?.duration_override ?? service.duration_min };
}

export function BookingForm({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BookingFormInitial;
  onCreated?: (id: string) => void;
}) {
  const { salon, locationId, staffId: ownStaffId, role } = useSalon();
  const sb = useSb();
  const toast = useToast();
  const queryClient = useQueryClient();
  const services = useServices();
  const staffQuery = useStaff();
  const staff = useMemo(() => (staffQuery.data ?? []).filter((s) => s.bookable && s.locations.includes(locationId)), [staffQuery.data, locationId]);

  const [client, setClient] = useState<ClientListRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [day, setDay] = useState(todayLocal(salon.timezone));
  const [time, setTime] = useState("10:00");
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [source, setSource] = useState("admin");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState("");

  useEffect(() => {
    if (!open) return;
    setClient(initial?.client ?? null);
    setDay(initial?.day ?? todayLocal(salon.timezone));
    setTime(initial?.time ?? "10:00");
    setItems([]);
    setStatus("confirmed");
    setSource("admin");
    setNote("");
    setInternal("");
  }, [open, initial, salon.timezone]);

  const defaultStaff = initial?.staffId ?? (role === "staff" && ownStaffId ? ownStaffId : staff[0]?.id ?? "");
  const serviceMap = useMemo(() => new Map((services.data?.services ?? []).map((s) => [s.id, s])), [services.data]);
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  function toggleService(service: ServiceRow) {
    setItems((current) => {
      const existing = current.find((item) => item.serviceId === service.id);
      if (existing) return current.filter((item) => item !== existing);
      const previousStaff = current.at(-1)?.staffId ?? defaultStaff;
      const eligible = staff.find((s) => s.id === previousStaff && s.services[service.id]) ?? staff.find((s) => s.services[service.id]);
      return [...current, { key: ++counter, serviceId: service.id, staffId: eligible?.id ?? "" }];
    });
  }

  const totals = items.reduce(
    (sum, item) => {
      const service = serviceMap.get(item.serviceId);
      if (!service) return sum;
      const { price, duration } = priceFor(service, staffMap.get(item.staffId));
      return { price: sum.price + price, minutes: sum.minutes + duration + service.buffer_after_min };
    },
    { price: 0, minutes: 0 },
  );

  const singleStaff = items.length > 0 && items.every((item) => item.staffId === items[0]!.staffId) ? items[0]!.staffId : null;

  const availability = useQuery({
    queryKey: ["availability", locationId, items.map((i) => i.serviceId).join(","), singleStaff, day],
    enabled: open && !!singleStaff && items.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.rpc("get_availability", { p_location: locationId, p_service_ids: items.map((i) => i.serviceId), p_from: day, p_to: day, p_staff: singleStaff });
      if (error) throw error;
      return ((data ?? []) as { slot_start: string }[]).map((row) => formatTime(row.slot_start, salon.timezone));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("admin_create_booking", {
        p_location: locationId,
        p_client: client!.id,
        p_items: items.map((item) => ({ service_id: item.serviceId, staff_id: item.staffId })),
        p_starts_at: localToISO(day, time, salon.timezone),
        p_source: source,
        p_client_note: note || null,
        p_internal_note: internal || null,
        p_status: status,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Rezervace vytvořena");
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onOpenChange(false);
      onCreated?.(id);
    },
    onError: (error) => toast.error("Rezervaci se nepodařilo vytvořit", errorMessage(error)),
  });

  const ready = !!client && items.length > 0 && items.every((i) => i.staffId) && /^\d{2}:\d{2}$/.test(time);
  const grouped = useMemo(() => {
    const list = services.data?.services ?? [];
    const categories = services.data?.categories ?? [];
    const groups = categories.map((category) => ({ id: category.id, name: category.name, services: list.filter((s) => s.category_id === category.id) }));
    const rest = list.filter((s) => !s.category_id || !categories.some((c) => c.id === s.category_id));
    if (rest.length) groups.push({ id: "other", name: "Ostatní", services: rest });
    return groups.filter((g) => g.services.length);
  }, [services.data]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Nová rezervace"
      description="Vyberte klienta, služby a termín."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button size="lg" loading={create.isPending} disabled={!ready} onClick={() => create.mutate()} leading={<Check className="h-4 w-4" />}>
            Vytvořit rezervaci
          </Button>
        </>
      }
    >
      <div className="grid gap-6 pb-2 lg:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-6">
          <section>
            <h3 className="mb-2.5 text-sm font-semibold">1. Klient</h3>
            <ClientPicker value={client} onChange={setClient} />
          </section>

          <section>
            <h3 className="mb-2.5 text-sm font-semibold">2. Služby</h3>
            <div className="grid gap-4">
              {grouped.map((group) => (
                <div key={group.id}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">{group.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.services.map((service) => {
                      const selected = items.some((item) => item.serviceId === service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service)}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-all duration-150",
                            selected ? "border-accent bg-accent-soft text-accent shadow-sm" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                          )}
                        >
                          {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4 text-fg-subtle" />}
                          <span>
                            <span className="block font-medium">{service.name}</span>
                            <span className="block text-xs opacity-70">
                              {durationLabel(service.duration_min)} · {czk(service.price)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div className="mt-4 grid gap-2 rounded-md border border-border p-3">
                {items.map((item) => {
                  const service = serviceMap.get(item.serviceId)!;
                  const eligible = staff.filter((s) => s.services[service.id]);
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{service.name}</span>
                      <div className="w-40">
                        <Select value={item.staffId} onChange={(event) => setItems((current) => current.map((i) => (i === item ? { ...i, staffId: event.target.value } : i)))} className="h-9" aria-label={`Pracovník pro ${service.name}`}>
                          <option value="">Vyberte…</option>
                          {eligible.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.display_name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <button type="button" onClick={() => toggleService(service)} className="rounded-sm p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger" aria-label="Odebrat">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="grid content-start gap-6">
          <section>
            <h3 className="mb-2.5 text-sm font-semibold">3. Termín</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum">
                <DatePicker value={day} onChange={setDay} />
              </Field>
              <Field label="Čas">
                <Input type="time" step={300} value={time} onChange={(event) => setTime(event.target.value)} leading={<Clock />} />
              </Field>
            </div>
            {singleStaff && (
              <div className="mt-3">
                <p className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Volné termíny
                  {availability.isFetching && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                </p>
                <div className="ui-scroll flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {(availability.data ?? []).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      className={cn("rounded-sm border px-2.5 py-1 text-xs font-medium tabular transition-colors", time === slot ? "border-accent bg-accent text-white" : "border-border hover:border-accent hover:text-accent")}
                    >
                      {slot}
                    </button>
                  ))}
                  {availability.data && availability.data.length === 0 && <p className="text-sm text-fg-muted">V tento den není volno. Termín můžete zadat ručně.</p>}
                </div>
              </div>
            )}
          </section>

          <section className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stav">
                <Select value={status} onChange={(event) => setStatus(event.target.value as "confirmed" | "pending")}>
                  <option value="confirmed">Potvrzeno</option>
                  <option value="pending">Čeká na potvrzení</option>
                </Select>
              </Field>
              <Field label="Zdroj">
                <Select value={source} onChange={(event) => setSource(event.target.value)}>
                  {["admin", "phone", "walk_in"].map((value) => (
                    <option key={value} value={value}>
                      {bookingSource[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Poznámka pro klienta">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Zobrazí se v potvrzení" />
            </Field>
            <Field label="Interní poznámka">
              <Textarea rows={2} value={internal} onChange={(event) => setInternal(event.target.value)} placeholder="Vidí jen tým" />
            </Field>
          </section>

          <section className="rounded-md bg-[image:var(--gradient-soft)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">Délka</span>
              <span className="font-medium tabular">{totals.minutes ? durationLabel(totals.minutes) : "—"}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-fg-muted">Cena</span>
              <span className="text-xl font-semibold tabular">{czk(totals.price)}</span>
            </div>
            {items[0] && staffMap.get(items[0].staffId) && (
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-sm">
                <Avatar name={staffMap.get(items[0].staffId)!.display_name} color={staffMap.get(items[0].staffId)!.color} size={24} />
                {staffMap.get(items[0].staffId)!.display_name}
              </div>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  );
}
