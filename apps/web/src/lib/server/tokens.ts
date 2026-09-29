import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret";
}

export function signToken(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url").slice(0, 32);
}

export function verifyToken(value: string, token: string): boolean {
  const expected = Buffer.from(signToken(value));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || `http://${process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost:3000"}`).replace(/\/$/, "");
}
