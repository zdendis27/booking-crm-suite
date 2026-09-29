import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrationsDir } from "./env";

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const output = files.map((f) => `-- ${f}\n${readFileSync(join(migrationsDir, f), "utf8")}`).join("\n\n");
const target = join(migrationsDir, "..", "bundle.sql");
writeFileSync(target, output);
console.log(`Uloženo ${target} (${files.length} migrací, ${Math.round(output.length / 1024)} kB)`);
