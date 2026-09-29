# booking-crm-suite (pracovní název produktu: Terminio)

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

```bash
pnpm install
cp .env.example apps/web/.env.local   # doplň hodnoty (Supabase apod.)
pnpm dev                               # http://localhost:3000
```

Před pushem:

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## Pravidla spolupráce (commity rovnou do `main`)

- Malé commity, často. Před pushem `git pull --rebase`.
- Migrace jen přidávat, už pushnuté nikdy needitovat.
- Tajemství (`.env*`) se nikdy nekomitují. Vzor je `.env.example`.
- Žádné texty ani název produktu natvrdo v komponentách: patří do `packages/copy`.
- Peníze vždy jako celé číslo v haléřích (`packages/db`).
- Změna rozhodnutí = úprava v `docs/` stejným commitem.
