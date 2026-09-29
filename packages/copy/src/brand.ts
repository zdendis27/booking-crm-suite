/**
 * Značka produktu na jednom místě. Rebrand = změna proměnných prostředí,
 * ne hledání názvu po kódu. Nikde jinde nepsat název produktu natvrdo.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Terminio",
  baseDomain: process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "localhost:3000",
} as const;
