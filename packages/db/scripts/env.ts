import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");

export function loadEnv(): void {
  for (const file of [join(root, "apps", "web", ".env.local"), join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[2] && !process.env[match[1]!]) {
        process.env[match[1]!] = match[2];
      }
    }
  }
}

export const migrationsDir = join(root, "supabase", "migrations");
