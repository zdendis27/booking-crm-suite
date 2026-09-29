import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnv, migrationsDir } from "./env";

loadEnv();

const args = new Set(process.argv.slice(2));
const statusOnly = args.has("--status");
const force = args.has("--force");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail("Chybí DATABASE_URL v apps/web/.env.local");
  if (/\[YOUR-PASSWORD\]/i.test(url)) fail("DATABASE_URL obsahuje zástupný text [YOUR-PASSWORD], nahraď ho skutečným heslem.");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    fail(`Připojení k databázi selhalo (${err.code ?? "chyba"}): ${err.message.replace(/:[^:@/]+@/, ":***@")}`);
  }

  await client.query("create schema if not exists supabase_migrations");
  await client.query(
    "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])",
  );
  const applied = new Set((await client.query<{ version: string }>("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f.split("_")[0]!));

  console.log(`Aplikováno: ${applied.size}, čeká: ${pending.length}`);
  for (const file of files) {
    console.log(`  ${applied.has(file.split("_")[0]!) ? "hotovo " : "čeká   "} ${file}`);
  }
  if (statusOnly || pending.length === 0) {
    await client.end();
    return;
  }

  if (applied.size === 0 && !force) {
    const existing = await client.query<{ n: string }>(
      "select count(*) as n from information_schema.tables where table_schema = 'public'",
    );
    if (Number(existing.rows[0]!.n) > 0) {
      await client.end();
      fail("Schéma public už obsahuje tabulky a nic ještě nebylo aplikováno. Přerušuji, aby se nic nepřepsalo (přepínač --force to obejde).");
    }
  }

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const version = file.split("_")[0]!;
    process.stdout.write(`Aplikuji ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, file.replace(/^\d+_/, "").replace(/\.sql$/, ""), [sql]],
      );
      await client.query("commit");
      console.log("ok");
    } catch (error) {
      await client.query("rollback");
      console.log("CHYBA");
      await client.end();
      fail(`Migrace ${file} selhala a byla vrácena zpět: ${(error as Error).message}`);
    }
  }
  await client.end();
  console.log("Hotovo.");
}

main().catch((error) => fail(String(error)));
