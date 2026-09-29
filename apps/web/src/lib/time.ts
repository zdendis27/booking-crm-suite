import { TZDate } from "@date-fns/tz";
import { addDays, todayISO } from "@repo/ui";

export const defaultTimeZone = "Europe/Prague";

export function localToISO(day: string, time: string, timeZone = defaultTimeZone): string {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new TZDate(y!, (m ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0, timeZone).toISOString();
}

export function dayBoundsISO(day: string, timeZone = defaultTimeZone): { from: string; to: string } {
  return { from: localToISO(day, "00:00", timeZone), to: localToISO(addDays(day, 1), "00:00", timeZone) };
}

interface LocalParts {
  day: string;
  time: string;
  minutes: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let existing = formatters.get(timeZone);
  if (!existing) {
    existing = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, existing);
  }
  return existing;
}

const weekdayIndex: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toLocal(iso: string, timeZone = defaultTimeZone): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
    minutes: Number(hour) * 60 + Number(parts.minute),
    weekday: weekdayIndex[parts.weekday!] ?? 1,
  };
}

export function formatTime(iso: string, timeZone = defaultTimeZone): string {
  return toLocal(iso, timeZone).time;
}

export function formatDateTime(iso: string, timeZone = defaultTimeZone): string {
  const local = toLocal(iso, timeZone);
  const [y, m, d] = local.day.split("-");
  return `${Number(d)}. ${Number(m)}. ${y} ${local.time}`;
}

export function formatDate(iso: string, timeZone = defaultTimeZone): string {
  const [y, m, d] = toLocal(iso, timeZone).day.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function todayLocal(timeZone = defaultTimeZone): string {
  return todayISO(timeZone);
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const relative = new Intl.RelativeTimeFormat("cs-CZ", { numeric: "auto" });
export function relativeDays(fromDay: string, toDay: string): string {
  const diff = Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86400000);
  return relative.format(diff, "day");
}
