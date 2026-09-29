export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function addDays(value: string, days: number): string {
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

export function addMonths(value: string, months: number): string {
  const date = parseISODate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toISODate(date);
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function startOfWeek(value: string): string {
  const date = parseISODate(value);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return toISODate(date);
}

export function monthGrid(monthStart: string): string[] {
  const first = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function todayISO(timeZone = "Europe/Prague"): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

const monthFormat = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric", timeZone: "UTC" });
export function formatMonth(value: string): string {
  return monthFormat.format(parseISODate(value));
}

const dayFormat = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export function formatDayLong(value: string): string {
  return dayFormat.format(parseISODate(value));
}

const shortFormat = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
export function formatDayShort(value: string): string {
  return shortFormat.format(parseISODate(value));
}

export const weekdayLabels = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
