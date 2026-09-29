# BeautySystem (pracovní název produktu: Terminio)

GitHub repozitář se jmenuje `booking-crm-suite`, lokální složka `BeautySystem`.

Český SaaS pro beauty a služby na rezervace: rezervace → klient → návštěva → platba → doklad → finance → marketing → další návštěva.

Plán, rozhodnutí a specifikace jsou ve složce [`docs/`](docs/). Začni od [`docs/00-rozhodnuti.md`](docs/00-rozhodnuti.md).

## Struktura

```
apps/web        Next.js aplikace (majitel/personál, rezervace, mini web salonu)
packages/ui     design systém (tokeny, komponenty)
packages/copy   všechny české texty a značka produktu
packages/db     typy, peníze v haléřích, sdílená schémata
packages/config sdílená konfigurace TypeScriptu
supabase/       migrace a DB testy (přibude v kroku 0)
docs/           rozhodnutí, datový model, architektura, MVP
```

## Požadavky

- Node 22 (`.nvmrc`)
- pnpm 8.8.0 (`corepack enable` a verze se vezme z `package.json`)

## Rychlý start

Všechny příkazy se spouštějí v kořenové složce projektu (tam, kde je `package.json`).

```bash
pnpm install
```

Soubor `apps/web/.env.local` s klíči vytvoř jen pokud ještě neexistuje, jinak by se přepsal:

```bash
cp -n .env.example apps/web/.env.local
```

V PowerShellu:

```powershell
if (-not (Test-Path apps/web/.env.local)) { Copy-Item .env.example apps/web/.env.local }
```

Kam co patří v `.env.local` je v [`docs/06-stav-a-nastaveni.md`](docs/06-stav-a-nastaveni.md).

```bash
pnpm dev
```

Databáze:

```bash
pnpm --filter @repo/db test
pnpm --filter @repo/db db:status
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db db:types
```

Před pushem:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
## Pravidla spolupráce (commity rovnou do `main`)

- Malé commity, často. Před pushem `git pull --rebase`.
- Migrace 0001 až 0010 jsou nasazené v Supabase a už se neupravují. Každá změna databáze je nová migrace (nový soubor s novějším časovým razítkem) a nahraje se přes `db:migrate`.
- Tajemství (`.env*`) se nikdy nekomitují. Vzor je `.env.example`.
- Žádné texty ani název produktu natvrdo v komponentách: patří do `packages/copy`.
- Peníze vždy jako celé číslo v haléřích (`packages/db`).
- Změna rozhodnutí = úprava v `docs/` stejným commitem.
