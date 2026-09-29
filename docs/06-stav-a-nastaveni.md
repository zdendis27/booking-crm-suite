# Stav projektu a nastavení

## Hotovo

- Databáze (Supabase / PostgreSQL) nahraná do vývojového projektu: 14 migrací, 70 tabulek, RLS na všech tenantových tabulkách.
- 135 automatických testů (PGlite, bez Dockeru a bez cloudu): izolace salonů, rezervace a dostupnost, souběžné rezervace, věrnost, platby, poukazy, zálohy, česká fakturace, sklad, provize, docházka, notifikace, připomínka vrácení klienta, kampaně, analytika, zakládání salonu.
- Ověření na skutečném Supabase (15 kontrol): veřejné čtení, zákaz pro anonyma, přihlášení, trigger zákaznického účtu, založení salonu, RLS, veřejná stránka, dostupnost, analytika.
- Typy databáze pro TypeScript: `packages/db/src/database.types.ts` (generuje `pnpm --filter @repo/db db:types`).
- CI: typecheck, lint, testy, build.

## Rozhodnuto při stavbě

- SMS ověření telefonu se zatím neřeší. Ověřuje se e-mail (Google, Apple nebo kód). Politika `email_phone` je v databázi připravená, ale v aplikaci se nenabízí.
- E-mailové adresy jsou `text` s normalizací na malá písmena (ne `citext`, který na Supabase nefunguje spolehlivě s prázdným `search_path`).
- Pravidla provizí: rozhoduje nejdřív konkrétnost (služba/produkt, pak kategorie, pak vše), u shody má přednost pravidlo pracovníka před obecným pravidlem salonu.
- Věrnostní odměna se uplatňuje ručně.

## Nastavení `apps/web/.env.local`

| Proměnná | Kde ji v Supabase najdeš |
|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | pracovní název, zůstává `Terminio` |
| `NEXT_PUBLIC_BASE_DOMAIN` | lokálně `localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings, API, Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings, API Keys: „anon public“ (nebo „Publishable key“) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings, API Keys: „service_role“ (nebo „Secret key“). Jen na serveru, nikdy do prohlížeče |
| `DATABASE_URL` | tlačítko Connect nahoře, Connection string, metoda **Session pooler**. Slouží jen k nahrání databáze (`db:migrate`) |

`DATABASE_URL` má tvar `postgresql://postgres.<ref>:<HESLO>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`. Heslo je heslo databáze zvolené při zakládání projektu (Project Settings, Database, Reset database password) a píše se bez hranatých závorek.

| `NEXT_PUBLIC_APP_URL` | adresa aplikace, lokálně `http://localhost:3000` |
| `CRON_SECRET` | libovolný dlouhý náhodný řetězec, chrání `/api/cron/notifications` |
| `LINK_SECRET` | libovolný dlouhý náhodný řetězec, podepisuje odkazy pro odhlášení z nabídek |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | klíče pro push, vygenerované příkazem `web-push generate-vapid-keys` |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com, API Keys. Bez klíče se e-maily vypisují do konzole serveru |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Dashboard, Developers. Webhook míří na `/api/stripe/webhook` (události účtu i Connect) |
| `ANTHROPIC_API_KEY` | pro AI asistenta |

Zpracování upozornění spouští `/api/cron/notifications` (hlavička `Authorization: Bearer <CRON_SECRET>`). Na hostingu ho volejte každou minutu, lokálně stačí `curl`.

## Hotovo v aplikaci

Přihlášení, průvodce salonu, kalendář, rezervace, klienti, služby, tým a provize, pokladna, finance, faktury s PDF a QR, poukazy, sklad, věrnost, marketing a automatizace, AI asistent, nastavení, notifikační worker (e-mail, push), PWA (manifest, ikony, service worker), veřejný mini web, online rezervace včetně čekací listiny a záloh, prodej poukazů, zákaznický účet, úvodní stránka, právní dokumenty, odhlášení z nabídek.

## Zbývá

- SMS ověření telefonu a odesílání SMS (bránu vybrat a napojit).
- Ostré napojení Stripe (klíče, webhook) a Resend (doména odesílatele).
- Ověřit v Supabase úložiště `salon-media` (bucket a pravidla) pro nahrávání fotek.
- Právní texty nechat zkontrolovat právníkem.
- Mobilní aplikace (Expo).
