import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDb } from "../tests/support/harness";

const target = join(__dirname, "..", "src", "database.types.ts");

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  is_generated: string;
}

const scalar: Record<string, string> = {
  uuid: "string",
  text: "string",
  "character varying": "string",
  character: "string",
  citext: "string",
  integer: "number",
  smallint: "number",
  bigint: "number",
  numeric: "number",
  real: "number",
  "double precision": "number",
  boolean: "boolean",
  jsonb: "Json",
  json: "Json",
  date: "string",
  time: "string",
  "time without time zone": "string",
  "timestamp with time zone": "string",
  "timestamp without time zone": "string",
  tstzrange: "string",
  interval: "string",
  void: "undefined",
  name: "string",
  inet: "string",
};

const udtScalar: Record<string, string> = {
  int2: "number",
  int4: "number",
  int8: "number",
  float4: "number",
  float8: "number",
  bool: "boolean",
  timestamptz: "string",
  timestamp: "string",
  varchar: "string",
  bpchar: "string",
};

async function main() {
  const db = await createDb();

  const enumRows = await db.query<{ typname: string; labels: string[] }>(`
    select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by t.typname`);
  const enums = new Map(enumRows.rows.map((r) => [r.typname, r.labels]));

  const relations = await db.query<{ relname: string; relkind: string }>(`
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname`);
  const columns = await db.query<Column>(`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_generated
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);
  const tableNames = new Set(relations.rows.map((r) => r.relname));

  const tsFromUdt = (udt: string, dataType: string): string => {
    if (dataType === "ARRAY") {
      return `${tsFromUdt(udt.replace(/^_/, ""), "")}[]`;
    }
    if (enums.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
    return scalar[dataType] ?? scalar[udt] ?? udtScalar[udt] ?? "unknown";
  };

  const tsFromFormat = (raw: string): string => {
    let type = raw.trim().replace(/^public\./, "");
    if (type.endsWith("[]")) return `${tsFromFormat(type.slice(0, -2))}[]`;
    type = type.replace(/\(.*\)$/, "");
    if (enums.has(type)) return `Database["public"]["Enums"]["${type}"]`;
    if (tableNames.has(type)) return `Database["public"]["Tables"]["${type}"]["Row"]`;
    return scalar[type] ?? "unknown";
  };

  const byTable = new Map<string, Column[]>();
  for (const col of columns.rows) {
    byTable.set(col.table_name, [...(byTable.get(col.table_name) ?? []), col]);
  }

  const lines: string[] = [];
  lines.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];", "");
  lines.push("export type Database = {", "  public: {", "    Tables: {");
  for (const rel of relations.rows.filter((r) => r.relkind === "r")) {
    const cols = byTable.get(rel.relname) ?? [];
    const row = cols.map((c) => `          ${c.column_name}: ${tsFromUdt(c.udt_name, c.data_type)}${c.is_nullable === "YES" ? " | null" : ""}`);
    const insertable = cols.filter((c) => c.is_generated !== "ALWAYS");
    const insert = insertable.map((c) => {
      const optional = c.is_nullable === "YES" || c.column_default !== null;
      return `          ${c.column_name}${optional ? "?" : ""}: ${tsFromUdt(c.udt_name, c.data_type)}${c.is_nullable === "YES" ? " | null" : ""}`;
    });
    const update = insertable.map(
      (c) => `          ${c.column_name}?: ${tsFromUdt(c.udt_name, c.data_type)}${c.is_nullable === "YES" ? " | null" : ""}`,
    );
    lines.push(`      ${rel.relname}: {`, "        Row: {", ...row, "        }", "        Insert: {", ...insert, "        }", "        Update: {", ...update, "        }", "        Relationships: []", "      }");
  }
  lines.push("    }", "    Views: {", "      [_ in never]: never", "    }", "    Functions: {");

  const functions = await db.query<{ proname: string; args: string; result: string }>(`
    select p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as result
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' order by p.proname`);
  const skip = /^(_|apply_|attach_|guard_|sync_|compute_|normalize_|set_updated|enforce_|booking_.*_hook|booking_status_side_effects|link_new_|is_privileged|setting_int|has_|current_|is_salon_member|apply_stock)/;
  const exposedHelpers = new Set(["has_salon_role", "has_consent", "current_salon_ids", "current_customer_account_id"]);
  for (const fn of functions.rows) {
    if (fn.result === "trigger") continue;
    if (skip.test(fn.proname) && !exposedHelpers.has(fn.proname)) continue;
    const args = fn.args
      ? fn.args.split(/,\s*(?![^()]*\))/).map((part) => {
          const trimmed = part.trim().replace(/^(IN|OUT|INOUT|VARIADIC)\s+/, "");
          const hasDefault = /\sDEFAULT\s/.test(trimmed);
          const [name, ...rest] = trimmed.replace(/\sDEFAULT\s.*$/, "").split(" ");
          return `${name}${hasDefault ? "?" : ""}: ${tsFromFormat(rest.join(" "))}`;
        })
      : [];
    let returns: string;
    const tableMatch = /^TABLE\((.*)\)$/s.exec(fn.result);
    const setOf = /^SETOF\s+(.*)$/.exec(fn.result);
    if (tableMatch) {
      const fields = tableMatch[1]!.split(/,\s*(?![^()]*\))/).map((f) => {
        const [name, ...rest] = f.trim().split(" ");
        return `${name}: ${tsFromFormat(rest.join(" "))}`;
      });
      returns = `Array<{ ${fields.join("; ")} }>`;
    } else if (setOf) {
      returns = `Array<${tsFromFormat(setOf[1]!)}>`;
    } else {
      returns = tsFromFormat(fn.result);
    }
    lines.push(`      ${fn.proname}: {`, `        Args: ${args.length ? `{ ${args.join("; ")} }` : "Record<PropertyKey, never>"}`, `        Returns: ${returns}`, "      }");
  }
  lines.push("    }", "    Enums: {");
  for (const [name, labels] of enums) {
    lines.push(`      ${name}: ${labels.map((l) => `"${l}"`).join(" | ")}`);
  }
  lines.push("    }", "    CompositeTypes: {", "      [_ in never]: never", "    }", "  }", "}", "");
  lines.push(
    'type PublicSchema = Database["public"];',
    "",
    'export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];',
    'export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];',
    'export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];',
    'export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];',
    "",
  );

  writeFileSync(target, lines.join("\n"));
  console.log(`Uloženo ${target}: ${relations.rows.filter((r) => r.relkind === "r").length} tabulek, ${enums.size} výčtů`);
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
