# Terminio – architektura a repozitář (návrh v1)

Tým: 2 lidé (vy + kamarád `zdendis27`), spolupráce na kódu, **commity rovnou do `main`**. Repozitář: `booking-crm-suite` (název repa je nezávislý na názvu produktu, rebrand tím není dotčen).

## 1. Zásady
1. **Jeden monorepozitář, jedna hlavní webová aplikace.** Jednodušší pro dva lidi než víc služeb.
2. **Logika v databázi tam, kde jde o správnost dat** (RLS, exclusion constraint, číslování, stavové přechody). Aplikace nesmí jít obejít.
3. **Žádný název produktu natvrdo v kódu** (rebrand): jméno, barvy a domény přes konfiguraci. Texty v jednom místě (`packages/copy`).
4. **Vše nasaditelné z `main`.** Nedokončené funkce za feature flagem.
5. **Migrace jsou historie, ne zdroj pravdy k přepisování:** už aplikovanou migraci nikdy needitujeme, jen přidáváme novou.

## 2. Struktura repozitáře

```
booking-crm-suite/
├─ apps/
│  └─ web/                 Next.js (App Router, TypeScript)
│     ├─ (marketing)       veřejný web produktu, ceník
│     ├─ (app)             aplikace majitel/personál   → app.<doména>
│     ├─ (book)            rezervace + mini web salonu → <slug>.<doména>
│     └─ (account)         zákaznický profil           → moje.<doména> (nebo /account)
├─ packages/
│  ├─ ui/                  design systém (tokeny, komponenty, SVG ikony, animace)
│  ├─ db/                  generované typy z Supabase, zod schémata, dotazy
│  ├─ copy/                všechny české texty (jedno místo)
│  └─ config/              tsconfig, eslint, tailwind preset
├─ supabase/
│  ├─ migrations/          SQL migrace (časová razítka)
│  ├─ seed.sql             testovací data
│  ├─ tests/               pgTAP: RLS, exclusion constraint, stavy
│  └─ functions/           Edge Functions (worker notifikací, hooky)
├─ docs/                   rozhodnutí, model, architektura, specifikace
└─ .github/workflows/      CI
```

Jedna Next.js aplikace obslouží všechny „tváře“ podle hostname (middleware). Rozdělení na víc aplikací se dělá až při reálné potřebě.

## 3. Technologie

| Oblast | Volba |
|---|---|
| Jazyk | TypeScript (strict) |
| Web | Next.js (App Router), React, server komponenty |
| Správa balíčků | pnpm workspaces + Turborepo |
| Styling / UI | Tailwind, shadcn/ui (Radix) jako základ, Motion pro animace, vlastní SVG |
| Databáze | Supabase (PostgreSQL) |
| Auth | Supabase Auth: Google, Apple, e-mail kód. Personál i zákazníci ve stejném auth, rozliší je `memberships` vs `customer_accounts` |
| SMS (jen login/ověření) | Custom SMS provider přes **Supabase Auth SMS hook** (CZ poskytovatel; výběr níže) |
| E-mail | Resend (šablony v kódu, React Email) |
| Push | Web Push (VAPID) přes PWA, odesílá worker |
| Platby | Stripe Connect (fáze 2) |
| Joby | `pg_cron` + `pg_net` → Edge Function `notifications-worker` (každou minutu zpracuje outbox) |
| Hosting | Vercel (web) + Supabase (DB/Auth/Functions) |
| Validace | zod všude na hranici (formuláře, API, webhooky) |
| Testy | Vitest (unit), pgTAP (DB, RLS), Playwright (e2e rezervace) |
| CI | GitHub Actions: typecheck, lint, testy, kontrola migrací, RLS testy |
| Chyby | Sentry (od prvního nasazení) |

## 4. Prostředí
- **dev:** sdílený cloudový Supabase projekt (bez Dockeru), Vercel preview z větví/commitů.
- **prod:** samostatný Supabase projekt + Vercel produkce. Vznikne před prvním pilotním salonem.
- Klíče a secrets jen v proměnných prostředí (`.env.local`, Vercel, Supabase), `.env.example` v repu. **Nikdy se nekomitují.**
- Dev a prod databáze mají oddělené klíče. Do produ se migrace nasazují jen z `main` přes CI.

## 5. Klíčové návrhy

**Multi-tenancy:** každá tenantová tabulka `salon_id` + RLS přes `current_salon_ids()`. Při vývoji existuje test „uživatel salonu A nesmí přečíst ani zapsat data salonu B“ pro každou tabulku.

**Veřejná rezervace:** žádný přímý přístup na tabulky. Servery endpointy (route handlery) s rate-limitem a captcha: `getAvailability`, `createPendingBooking`, `verify`, `confirm`. Kód s `service_role` klíčem běží jen na serveru.

**Dostupnost:** funkce v DB (`get_availability(location, service_items, date_range)`) = směny − dovolené − obsazené sloty − minimální předstih. Jedna implementace, kterou používá web i aplikace.

**Notifikace (outbox):** akce (potvrzení rezervace, připomínka, návrat klienta) vloží řádek do `notifications` s `dedupe_key`. Worker je odešle přes e-mail/push/SMS podle tarifu salonu a souhlasů klienta. Retry s backoff, stav a chyba u každé zprávy.

**Připomínka vrácení klienta:** denní job přepočítá `client_stats` a vloží notifikace (logika viz `02-datovy-model.md` §6).

**Tarify a limity:** `plans.limits` (pracovníci, pobočky, SMS balíček, funkce). Kontroluje se v DB u tvrdých limitů a v aplikaci u UI. SMS upozornění se posílají, jen pokud tarif salonu SMS obsahuje.

**Peníze:** vždy `bigint` haléře, formátování jen v UI.

**Časy:** UTC v DB, `Europe/Prague` při zobrazení a výpočtu směn (pozor na změnu času).

## 6. Pracovní pravidla ve dvou (main)
- Malé commity, často. Před každým pushem `git pull --rebase`.
- Migrace: název s časovým razítkem, **jeden autor na jednu migraci**, po pushi se needituje. Konflikt čísel řeší ten, kdo pushuje později.
- Před pushem lokálně `pnpm typecheck && pnpm lint && pnpm test`. CI po pushi je pojistka, ne první kontrola.
- Rozdělení modulů (viz `05-mvp-specifikace.md`): každý si bere jiný modul, dohodnout se před zahájením, aby se nemodifikovaly stejné soubory.
- Změny v `docs/` (rozhodnutí) se zapisují stejným commitem jako kód, kterého se týkají.
- **Doporučení:** i při commitech do `main` zapnout na GitHubu základní ochranu (zákaz force push a smazání větve). Ochranu na povinné PR případně později, až bude produkce.

## 7. Otevřené
- **SMS poskytovatel pro CZ** (jen ověření): kandidáti GoSMS, SMSbrána, Twilio. Podle ceny, spolehlivosti doručení na CZ operátory a API. Rozhodnout před implementací ověření telefonu (ne před základem).
- **Doména produktu** (mimo pracovní název): ovlivňuje subdomény salonů a Apple/Google přihlášení. Do té doby `localhost` a Vercel preview.
- **Vercel a Supabase účty:** kdo je vlastní (osobní účet, nebo společná organizace) a kdo má přístup.
