import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Slučuje třídy a řeší konflikty Tailwindu (poslední vyhrává). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
