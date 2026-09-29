"use client";

import { Avatar, Button, EmptyState, MonthCalendar, Popover, SegmentedControl, Skeleton, addDays, cn, formatDayLong, startOfWeek, useMediaQuery, useToast } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Eye, EyeOff, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useSalon } from "@/components/app/salon-context";
import { errorMessage, useSb, useStaff } from "@/lib/data";
import { dayBoundsISO, localToISO, minutesToTime, timeToMinutes, todayLocal, toLocal } from "@/lib/time";
import { BookingForm, type BookingFormInitial } from "./booking-form";
import { BookingSheet } from "./booking-sheet";
import { CalendarGrid, useNowMinutes, type CalBooking, type CalColumn, type Interval } from "./calendar-grid";

interface ScheduleRow {
  staff_id: string;
  weekday: number;
  starts: string;
  ends: string;
  valid_from: string | null;
  valid_to: string | null;
}
interface OverrideRow {
  staff_id: string;
  day: string;
  kind: "extra" | "off";
  starts: string | null;
  ends: string | null;
}
interface TimeOffRow {
  staff_id: string;
  during: string;
  kind: string;
  note: string | null;
}

function parseRange(value: string): { from: string; to: string } | null {
  const match = /^[\[(]"?([^",]+)"?,\s*"?([^")\]]+)"?[\])]$/.exec(value);
  if (!match) return null;
  const iso = (text: string) => new Date(text.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString();
  return { from: iso(match[1]!), to: iso(match[2]!) };
}

const weekdayFormat = new Intl.DateTimeFormat("cs-CZ", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" });

export function CalendarPage() {
  const { salon, locationId, role, staffId: ownStaff, can } = useSalon();
  const sb = useSb();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tz = salon.timezone;
  const today = todayLocal(tz);
  const nowMinutes = useNowMinutes(tz);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [day, setDay] = useState(today);
  const [view, setView] = useState<"day" | "week">("day");
  const [hidden, setHidden] = useState<string[]>([]);
  const [mobileStaff, setMobileStaff] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<BookingFormInitial | undefined>();
  const openId = search.get("rezervace");

  const staffQuery = useStaff();
  const allStaff = useMemo(() => {
    const list = (staffQuery.data ?? []).filter((s) => s.bookable && s.locations.includes(locationId));
    return role === "staff" && ownStaff ? list.filter((s) => s.id === ownStaff) : list;
  }, [staffQuery.data, locationId, role, ownStaff]);
  const staffColors = useMemo(() => Object.fromEntries(allStaff.map((s) => [s.id, { color: s.color, name: s.display_name }])), [allStaff]);

  useEffect(() => {
    if (search.get("nova")) {
      setFormInitial({ day, time: "10:00" });
      setFormOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [search, pathname, router, day]);

  useEffect(() => {
    if (isMobile && !mobileStaff && allStaff[0]) setMobileStaff(allStaff[0].id);
  }, [isMobile, mobileStaff, allStaff]);

  const rangeStart = view === "week" ? startOfWeek(day) : day;
  const rangeEnd = view === "week" ? addDays(rangeStart, 6) : day;
  const range = useMemo(() => ({ from: dayBoundsISO(rangeStart, tz).from, to: dayBoundsISO(rangeEnd, tz).to }), [rangeStart, rangeEnd, tz]);
  const bookingsKey = ["bookings", "calendar", locationId, range.from, range.to];

  const bookings = useQuery({
    queryKey: bookingsKey,
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("bookings")
        .select("id,status,source,starts_at,ends_at,primary_staff_id,price_total, client:clients(first_name,last_name,full_name), items:booking_items(name_snap,staff_id)")
        .eq("location_id", locationId)
        .gte("starts_at", range.from)
        .lt("starts_at", range.to)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as CalBooking[];
    },
  });

  const schedule = useQuery({
    queryKey: ["schedule-data", locationId, rangeStart, rangeEnd],
    enabled: !!locationId,
    queryFn: async () => {
      const [weekly, overrides, off] = await Promise.all([
        sb.from("staff_schedules").select("staff_id,weekday,starts,ends,valid_from,valid_to").eq("location_id", locationId),
        sb.from("staff_schedule_overrides").select("staff_id,day,kind,starts,ends").eq("location_id", locationId).gte("day", rangeStart).lte("day", rangeEnd),
        sb.from("staff_time_off").select("staff_id,during,kind,note").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(300),
      ]);
      return {
        weekly: (weekly.data ?? []) as ScheduleRow[],
        overrides: (overrides.data ?? []) as OverrideRow[],
        off: ((off.data ?? []) as TimeOffRow[]).flatMap((row) => {
          const parsed = parseRange(row.during);
          return parsed ? [{ ...row, ...parsed }] : [];
        }),
      };
    },
  });

  const visibleStaff = useMemo(() => {
    if (isMobile) return allStaff.filter((s) => s.id === mobileStaff);
    return allStaff.filter((s) => !hidden.includes(s.id));
  }, [allStaff, hidden, isMobile, mobileStaff]);

  const shownBookings = useMemo(() => {
    const rows = (bookings.data ?? []).filter((b) => showCancelled || !["cancelled_by_client", "cancelled_by_salon"].includes(b.status));
    return view === "week" ? rows.filter((b) => visibleStaff.some((s) => s.id === b.primary_staff_id)) : rows;
  }, [bookings.data, showCancelled, view, visibleStaff]);

  const working = (staffId: string | null, forDay: string): Interval[] | null => {
    const data = schedule.data;
    if (!data) return null;
    const staffIds = staffId ? [staffId] : visibleStaff.length === 1 ? [visibleStaff[0]!.id] : null;
    if (!staffIds) return null;
    const weekday = toLocal(localToISO(forDay, "12:00", tz), tz).weekday;
    const result: Interval[] = [];
    for (const id of staffIds) {
      const off = data.overrides.some((o) => o.staff_id === id && o.day === forDay && o.kind === "off");
      if (!off) {
        for (const row of data.weekly) {
          if (row.staff_id !== id || row.weekday !== weekday) continue;
          if (row.valid_from && row.valid_from > forDay) continue;
          if (row.valid_to && row.valid_to < forDay) continue;
          result.push({ start: timeToMinutes(row.starts), end: timeToMinutes(row.ends) });
        }
      }
      for (const row of data.overrides) {
        if (row.staff_id === id && row.day === forDay && row.kind === "extra" && row.starts && row.ends) {
          result.push({ start: timeToMinutes(row.starts), end: timeToMinutes(row.ends) });
        }
      }
    }
    return result;
  };

  const timeOff = (staffId: string | null, forDay: string) => {
    const data = schedule.data;
    if (!data) return [];
    const ids = staffId ? [staffId] : visibleStaff.length === 1 ? [visibleStaff[0]!.id] : [];
    const bounds = dayBoundsISO(forDay, tz);
    return data.off
      .filter((row) => ids.includes(row.staff_id) && row.from < bounds.to && row.to > bounds.from)
      .map((row) => ({
        start: row.from <= bounds.from ? 0 : toLocal(row.from, tz).minutes,
        end: row.to >= bounds.to ? 24 * 60 : toLocal(row.to, tz).minutes,
        label: row.note || (row.kind === "vacation" ? "Dovolená" : row.kind === "sick" ? "Nemoc" : "Blokace"),
      }));
  };

  const columns: CalColumn[] = useMemo(() => {
    if (view === "day") {
      return visibleStaff.map((s) => ({ id: s.id, day, staffId: s.id, title: s.display_name, subtitle: s.title ?? undefined, color: s.color, avatar: s.display_name }));
    }
    return Array.from({ length: 7 }, (_, index) => {
      const value = addDays(rangeStart, index);
      const date = new Date(`${value}T00:00:00Z`);
      return { id: value, day: value, staffId: null, title: weekdayFormat.format(date), subtitle: dayMonth.format(date) };
    });
  }, [view, visibleStaff, day, rangeStart]);

  let axisMin = 8 * 60;
  let axisMax = 19 * 60;
  for (const column of columns) {
    for (const interval of working(column.staffId, column.day) ?? []) {
      axisMin = Math.min(axisMin, interval.start);
      axisMax = Math.max(axisMax, interval.end);
    }
  }
  for (const booking of shownBookings) {
    axisMin = Math.min(axisMin, toLocal(booking.starts_at, tz).minutes);
    axisMax = Math.max(axisMax, toLocal(booking.ends_at, tz).minutes);
  }
  const axisStart = Math.max(0, Math.floor(axisMin / 60) * 60);
  const axisEnd = Math.min(24 * 60, Math.ceil(axisMax / 60) * 60);

  const move = useMutation({
    mutationFn: async (arg: { booking: CalBooking; iso: string; staffId: string | null }) => {
      const { error } = await sb.rpc("move_booking", { p_booking: arg.booking.id, p_new_start: arg.iso, p_new_staff: arg.staffId && arg.staffId !== arg.booking.primary_staff_id ? arg.staffId : null });
      if (error) throw error;
    },
    onMutate: async (arg) => {
      await qc.cancelQueries({ queryKey: bookingsKey });
      const previous = qc.getQueryData<CalBooking[]>(bookingsKey);
      const delta = Date.parse(arg.iso) - Date.parse(arg.booking.starts_at);
      qc.setQueryData<CalBooking[]>(bookingsKey, (current) =>
        (current ?? []).map((b) =>
          b.id === arg.booking.id
            ? { ...b, starts_at: arg.iso, ends_at: new Date(Date.parse(b.ends_at) + delta).toISOString(), primary_staff_id: arg.staffId ?? b.primary_staff_id }
            : b,
        ),
      );
      return { previous };
    },
    onError: (error, _arg, context) => {
      if (context?.previous) qc.setQueryData(bookingsKey, context.previous);
      toast.error("Termín se nepodařilo přesunout", errorMessage(error));
    },
    onSuccess: () => toast.success("Termín přesunut"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
    },
  });

  function openBooking(id: string | null) {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("rezervace", id);
    else params.delete("rezervace");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  function shift(direction: number) {
    setDay(addDays(day, direction * (view === "week" ? 7 : 1)));
  }

  const title = view === "week" ? `${dayMonth.format(new Date(`${rangeStart}T00:00:00Z`))} – ${dayMonth.format(new Date(`${rangeEnd}T00:00:00Z`))}` : formatDayLong(day);
  const total = shownBookings.filter((b) => ["pending", "confirmed", "completed"].includes(b.status)).length;

  return (
    <div>
      <PageHeader
        title="Kalendář"
        description={`${total} ${total === 1 ? "rezervace" : total >= 2 && total <= 4 ? "rezervace" : "rezervací"} ${view === "week" ? "tento týden" : day === today ? "dnes" : "v tento den"}`}
        actions={
          can(["owner", "manager", "reception", "staff"]) && (
            <Button
              size="lg"
              onClick={() => {
                setFormInitial({ day, time: "10:00", staffId: visibleStaff[0]?.id });
                setFormOpen(true);
              }}
              leading={<CalendarPlus className="h-[18px] w-[18px]" />}
              className="hidden sm:inline-flex"
            >
              Nová rezervace
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-xs">
          <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Předchozí">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover
            trigger={
              <button type="button" className="flex min-w-40 items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-semibold capitalize transition-colors hover:bg-surface-2">
                <CalendarDays className="h-4 w-4 text-accent" />
                {title}
              </button>
            }
          >
            <MonthCalendar value={day} onChange={setDay} className="w-64" />
          </Popover>
          <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Další">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDay(today)} disabled={day === today && view === "day"}>
          Dnes
        </Button>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Den" },
            { value: "week", label: "Týden" },
          ]}
        />
        <button
          type="button"
          onClick={() => setShowCancelled(!showCancelled)}
          className={cn("ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors", showCancelled ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-surface-2")}
        >
          {showCancelled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Zrušené
        </button>
      </div>

      {allStaff.length > 1 && (
        <div className="ui-scroll mb-4 flex gap-2 overflow-x-auto pb-1">
          {allStaff.map((s) => {
            const active = isMobile ? mobileStaff === s.id : !hidden.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (isMobile) setMobileStaff(s.id);
                  else setHidden((current) => (current.includes(s.id) ? current.filter((id) => id !== s.id) : [...current, s.id]));
                }}
                className={cn("flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition-all", active ? "border-transparent shadow-sm" : "border-border text-fg-subtle opacity-70 hover:opacity-100")}
                style={active ? { background: `color-mix(in srgb, ${s.color} 16%, var(--surface))`, boxShadow: `inset 0 0 0 1.5px ${s.color}` } : undefined}
              >
                <Avatar name={s.display_name} color={s.color} size={26} />
                {s.display_name}
              </button>
            );
          })}
        </div>
      )}

      {bookings.isLoading || staffQuery.isLoading || schedule.isLoading ? (
        <Skeleton className="h-[34rem] rounded-lg" />
      ) : columns.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Žádný pracovník k zobrazení" description="Přidejte pracovníka na pobočku nebo zapněte jeho zobrazení." />
      ) : (
        <CalendarGrid
          columns={columns}
          bookings={shownBookings}
          axisStart={axisStart}
          axisEnd={axisEnd}
          timeZone={tz}
          today={today}
          nowMinutes={nowMinutes}
          working={working}
          timeOff={timeOff}
          staffColors={staffColors}
          minColumnWidth={view === "week" ? 132 : 188}
          onOpen={openBooking}
          onEmptyClick={(column, minutes) => {
            setFormInitial({ day: column.day, time: minutesToTime(minutes), staffId: column.staffId ?? visibleStaff[0]?.id });
            setFormOpen(true);
          }}
          onDrop={(booking, column, minutes) =>
            move.mutate({ booking, iso: localToISO(column.day, minutesToTime(minutes), tz), staffId: view === "day" ? column.staffId : null })
          }
        />
      )}

      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-30 h-14 w-14 rounded-full shadow-glow sm:hidden"
        aria-label="Nová rezervace"
        onClick={() => {
          setFormInitial({ day, time: "10:00", staffId: visibleStaff[0]?.id });
          setFormOpen(true);
        }}
      >
        <Plus className="h-6 w-6" />
      </Button>

      <BookingForm open={formOpen} onOpenChange={setFormOpen} initial={formInitial} onCreated={(id) => openBooking(id)} />
      <BookingSheet bookingId={openId} onClose={() => openBooking(null)} />
    </div>
  );
}
