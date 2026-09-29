import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

const migrationsDir = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const shimPath = join(__dirname, "supabase-shim.sql");

export type Db = PGlite;

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createDb(): Promise<Db> {
  const db = new PGlite({ extensions: { btree_gist, citext, pg_trgm, unaccent } });
  await db.exec(readFileSync(shimPath, "utf8"));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migrace ${file} selhala: ${(error as Error).message}`);
    }
  }
  return db;
}

export async function asUser<T>(
  db: Db,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return fn(tx);
  });
}

export async function asService<T>(db: Db, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

export async function createUser(db: Db, email: string, opts: { phone?: string } = {}): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into auth.users (email, phone, email_confirmed_at, phone_confirmed_at) values ($1, $2, now(), $3) returning id",
    [email, opts.phone ?? null, opts.phone ? new Date().toISOString() : null],
  );
  return result.rows[0]!.id;
}
