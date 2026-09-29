"use client";

import { bookingStatus } from "@repo/copy";
import { Avatar, cn } from "@repo/ui";
import { motion, type PanInfo } from "motion/react";
import { Check, Palmtree, Repeat2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, minutesToTime, toLocal } from "@/lib/time";

export interface CalBooking {
  id: string;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string;
  primary_staff_id: string | null;
  price_total: number;
  client: { first_name: string; last_name: string; full_name: string } | null;
  items: { name_snap: string; staff_id: string }[];
}

export interface CalColumn {
  id: string;
  day: string;
  staffId: string | null;
  title: string;
  subtitle?: string;
  color?: string;
  avatar?: string;
}

export interface Interval {
  start: number;
  end: number;
}

export const HOUR_PX = 68;
const PPM = HOUR_PX / 60;
const SNAP = 15;

interface Placed {
  booking: CalBooking;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

function place(bookings: { booking: CalBooking; start: number; end: number }[]): Placed[] {
  const sorted = [...bookings].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    for (const item of group) item.lanes = lanes;
    result.push(...group);
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((p) => p.end > item.start).map((p) => p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return result;
}

export function CalendarGrid({
  columns,
  bookings,
  axisStart,
  axisEnd,
  timeZone,
  today,
  nowMinutes,
  working,
  timeOff,
  staffColors,
  onEmptyClick,
  onOpen,
  onDrop,
  minColumnWidth = 176,
}: {
  columns: CalColumn[];
  bookings: CalBooking[];
  axisStart: number;
  axisEnd: number;
  timeZone: string;
  today: string;
  nowMinutes: number;
  working: (staffId: string | null, day: string) => Interval[] | null;
  timeOff: (staffId: string | null, day: string) => { start: number; end: number; label: string }[];
  staffColors: Record<string, { color: string; name: string }>;
  onEmptyClick: (column: CalColumn, minutes: number) => void;
  onOpen: (id: string) => void;
  onDrop: (booking: CalBooking, column: CalColumn, minutes: number) => void;
  minColumnWidth?: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [ghost, setGhost] = useState<{ column: number; top: number; height: number; label: string } | null>(null);
  const totalMinutes = axisEnd - axisStart;
  const height = totalMinutes * PPM;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = Math.ceil(axisStart / 60) * 60; m <= axisEnd; m += 60) list.push(m);
    return list;
  }, [axisStart, axisEnd]);

  const byColumn = useMemo(() => {
    return columns.map((column) => {
      const items = bookings
        .map((booking) => {
          const start = toLocal(booking.starts_at, timeZone);
          const end = toLocal(booking.ends_at, timeZone);
          return { booking, day: start.day, start: start.minutes, end: end.day === start.day ? end.minutes : 24 * 60 };
        })
        .filter((item) => item.day === column.day && (column.staffId === null || item.booking.primary_staff_id === column.staffId))
        .map(({ booking, start, end }) => ({ booking, start, end: Math.max(end, start + 15) }));
      return place(items);
    });
  }, [columns, bookings, timeZone]);

  function snap(minutes: number) {
    return Math.max(axisStart, Math.min(axisEnd - SNAP, Math.round(minutes / SNAP) * SNAP));
  }

  function columnAt(clientX: number) {
    for (let i = 0; i < columnRefs.current.length; i++) {
      const rect = columnRefs.current[i]?.getBoundingClientRect();
      if (rect && clientX >= rect.left && clientX < rect.right) return i;
    }
    return -1;
  }

  const showNow = columns.some((c) => c.day === today) && nowMinutes >= axisStart && nowMinutes <= axisEnd;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      <div className="ui-scroll overflow-x-auto">
        <div style={{ minWidth: 56 + columns.length * minColumnWidth }}>
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface/95 backdrop-blur">
            <div className="w-14 shrink-0 border-r border-border" />
            {columns.map((column) => (
              <div key={column.id} className={cn("flex min-w-0 flex-1 items-center gap-2.5 border-r border-border px-3 py-2.5 last:border-r-0", column.day === today && column.staffId === null && "bg-accent-soft/50")}>
                {column.avatar !== undefined && <Avatar name={column.avatar} color={column.color} size={30} />}
                <div className="min-w-0">
                  <p className={cn("truncate text-sm font-semibold", column.day === today && column.staffId === null && "text-accent")}>{column.title}</p>
                  {column.subtitle && <p className="truncate text-xs text-fg-subtle">{column.subtitle}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="relative flex" ref={bodyRef} style={{ height }}>
            <div className="relative w-14 shrink-0 border-r border-border">
              {hours.map((minute) => (
                <span key={minute} className="absolute right-2 -translate-y-1/2 text-[11px] tabular text-fg-subtle" style={{ top: (minute - axisStart) * PPM }}>
                  {minutesToTime(minute)}
                </span>
              ))}
            </div>

            {columns.map((column, ci) => {
              const intervals = working(column.staffId, column.day);
              const offs = timeOff(column.staffId, column.day);
              return (
                <div
                  key={column.id}
                  ref={(node) => {
                    columnRefs.current[ci] = node;
                  }}
                  className="relative min-w-0 flex-1 cursor-cell border-r border-border last:border-r-0"
                  style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in srgb, var(--fg) 4%, transparent) 8px 9px)" }}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("[data-booking]")) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    onEmptyClick(column, snap(axisStart + (event.clientY - rect.top) / PPM));
                  }}
                >
                  {(intervals ?? [{ start: axisStart, end: axisEnd }]).map((interval, i) => (
                    <div key={i} className="absolute inset-x-0 bg-surface" style={{ top: (Math.max(interval.start, axisStart) - axisStart) * PPM, height: (Math.min(interval.end, axisEnd) - Math.max(interval.start, axisStart)) * PPM }} />
                  ))}
                  {hours.map((minute) => (
                    <div key={minute} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: (minute - axisStart) * PPM }} />
                  ))}
                  {hours.map((minute) => (
                    <div key={`h${minute}`} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/40" style={{ top: (minute + 30 - axisStart) * PPM }} />
                  ))}
                  {offs.map((off, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-x-1 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning-soft/80 p-2 text-xs font-medium text-warning"
                      style={{ top: (Math.max(off.start, axisStart) - axisStart) * PPM, height: (Math.min(off.end, axisEnd) - Math.max(off.start, axisStart)) * PPM }}
                    >
                      <Palmtree className="h-3.5 w-3.5" /> {off.label}
                    </div>
                  ))}

                  {byColumn[ci]!.map((placed) => {
                    const { booking } = placed;
                    const staffColor = staffColors[booking.primary_staff_id ?? ""]?.color ?? "#3056d3";
                    const status = bookingStatus[booking.status];
                    const draggable = ["pending", "confirmed"].includes(booking.status);
                    const top = (placed.start - axisStart) * PPM;
                    const blockHeight = Math.max(24, (placed.end - placed.start) * PPM - 2);
                    const width = 100 / placed.lanes;
                    const cancelled = ["cancelled_by_client", "cancelled_by_salon", "no_show"].includes(booking.status);
                    return (
                      <motion.div
                        key={booking.id}
                        data-booking
                        drag={draggable}
                        dragMomentum={false}
                        dragElastic={0}
                        dragSnapToOrigin
                        whileDrag={{ scale: 1.03, zIndex: 40, boxShadow: "0 18px 40px -12px rgb(0 0 0 / 0.4)" }}
                        onDragStart={() => setGhost(null)}
                        onDrag={(event, info: PanInfo) => {
                          const index = columnAt(info.point.x);
                          const rect = bodyRef.current?.getBoundingClientRect();
                          if (index < 0 || !rect) return;
                          const minutes = snap(placed.start + info.offset.y / PPM);
                          setGhost({ column: index, top: (minutes - axisStart) * PPM, height: blockHeight, label: minutesToTime(minutes) });
                        }}
                        onDragEnd={(event, info: PanInfo) => {
                          const index = columnAt(info.point.x);
                          setGhost(null);
                          if (index < 0) return;
                          const minutes = snap(placed.start + info.offset.y / PPM);
                          const target = columns[index]!;
                          if (target.id === column.id && minutes === placed.start) return;
                          onDrop(booking, target, minutes);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(booking.id);
                        }}
                        className={cn(
                          "absolute z-10 overflow-hidden rounded-md border-l-[4px] px-2 py-1 text-left shadow-xs transition-shadow hover:shadow-md",
                          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          booking.status === "pending" && "border border-dashed border-l-[4px]",
                          cancelled && "opacity-55",
                        )}
                        style={{
                          top,
                          height: blockHeight,
                          left: `calc(${placed.lane * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          borderLeftColor: booking.status === "no_show" ? "var(--danger)" : staffColor,
                          borderColor: booking.status === "pending" ? staffColor : undefined,
                          background: `color-mix(in srgb, ${booking.status === "no_show" ? "var(--danger)" : staffColor} ${booking.status === "completed" ? 10 : 16}%, var(--surface))`,
                        }}
                      >
                        <div className="flex items-center gap-1 text-xs font-semibold leading-tight">
                          <span className="tabular">{formatTime(booking.starts_at, timeZone)}</span>
                          {booking.status === "completed" && <Check className="h-3 w-3 text-success" strokeWidth={3} />}
                          {booking.source === "online" && <Repeat2 className="h-3 w-3 text-fg-subtle" />}
                          <span className="ml-auto truncate text-[10px] font-medium uppercase tracking-wide opacity-60">{booking.status === "pending" ? "čeká" : booking.status === "no_show" ? "nedorazil" : cancelled ? "zrušeno" : ""}</span>
                        </div>
                        <p className={cn("truncate text-[13px] font-medium leading-tight", cancelled && "line-through")}>{booking.client?.full_name}</p>
                        {blockHeight > 52 && <p className="truncate text-xs text-fg-muted">{booking.items.map((item) => item.name_snap).join(", ")}</p>}
                        {status && blockHeight > 84 && <p className="mt-0.5 text-[11px] text-fg-subtle">{status.label}</p>}
                      </motion.div>
                    );
                  })}

                  {ghost && ghost.column === ci && (
                    <div className="pointer-events-none absolute inset-x-1 z-30 rounded-md border-2 border-dashed border-accent bg-accent/10" style={{ top: ghost.top, height: ghost.height }}>
                      <span className="absolute -top-2.5 left-2 rounded-sm bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">{ghost.label}</span>
                    </div>
                  )}

                  {showNow && column.day === today && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMinutes - axisStart) * PPM }}>
                      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-accent-3 shadow-[0_0_0_3px_rgb(236_72_153/0.25)]" />
                      <span className="h-px flex-1 bg-accent-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useNowMinutes(timeZone: string) {
  const [now, setNow] = useState(() => toLocal(new Date().toISOString(), timeZone).minutes);
  useEffect(() => {
    const timer = setInterval(() => setNow(toLocal(new Date().toISOString(), timeZone).minutes), 30_000);
    return () => clearInterval(timer);
  }, [timeZone]);
  return now;
}
