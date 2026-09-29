import { formatCzk } from "@repo/db";

export { formatCzk };

export function czk(halere: number | null | undefined): string {
  return formatCzk(Math.round(halere ?? 0));
}

export function czkShort(halere: number): string {
  const value = halere / 100;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000).toLocaleString("cs-CZ")} tis.`;
  return Math.round(value).toLocaleString("cs-CZ");
}

export function percent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toLocaleString("cs-CZ", { maximumFractionDigits: digits })} %`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `${count} ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

export function fullName(client: { first_name: string; last_name: string }): string {
  return `${client.first_name} ${client.last_name}`.trim();
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length === 9) return `+420${digits}`;
  return digits;
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^\+(42[01])(\d{3})(\d{3})(\d{3})$/.exec(value);
  return match ? `+${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38);
}
