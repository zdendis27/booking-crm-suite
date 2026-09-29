# Terminio – specifikace MVP (fáze 0 + 1)

Cíl MVP: **3–5 pilotních salonů** používá Terminio jako hlavní rezervační systém a dá se prokázat hlavní hodnota – **klienti se vracejí sami**.

## Řez do vertikálních kroků (pořadí)

Každý krok je použitelný a nasaditelný, ne „vrstva bez UI“.

| # | Krok | Obsah | Hotovo, když |
|---|------|-------|--------------|
| 0 | **Základ** | Monorepo, Next.js, Supabase projekt, migrace `salons/locations/memberships`, auth (Google, Apple, e-mail), RLS + testy, CI, design systém (tokeny, základní komponenty, ikony), galerie komponent | Přihlásím se, vidím prázdný dashboard salonu; test izolace tenantů projde; CI zelené |
| 1 | **Onboarding salonu** | Registrace majitele, vytvoření salonu a pobočky, otevírací doba, slug | Nový majitel prochází průvodcem < 5 min a má salon |
| 2 | **Služby a pracovníci** | Kategorie a služby (délka, cena, „od“), pracovníci, jejich služby a ceny, týdenní směny, dovolená/blokace | Lze nastavit celý salon; dostupnost se počítá správně (testy včetně změny času) |
| 3 | **Kalendář a rezervace (admin)** | Kalendář den/týden po pracovnících, ruční rezervace, přesun tažením, storno, stavy, walk-in, hlavní pracovník, více služeb v rezervaci | Dva současné pokusy na stejný termín → druhý dostane konflikt; e2e test |
| 4 | **Zákaznický účet a online rezervace** | Veřejná rezervační stránka salonu, výběr služby/pracovníka/termínu, přihlášení (Google/Apple/e-mail), ověření dle nastavení salonu (e-mail / e-mail+telefon), držení termínu, potvrzení (auto/ručně dle pobočky), správa rezervace zákazníkem | Cizí člověk rezervuje z telefonu bez pomoci za < 2 min; limity a captcha fungují |
| 5 | **Klienti / CRM** | Seznam, profil, historie, poznámky, souhlasy, statistiky, vyhledávání, sloučení duplicit | Klient z online i ruční rezervace je jeden záznam s historií |
| 6 | **Notifikace** | Outbox + worker, e-mail (potvrzení, připomínka, storno), push pro personál i zákazníky s PWA, šablony k úpravě, SMS jen dle tarifu | Zprávy chodí spolehlivě, nikdy dvakrát, s auditní stopou |
| 7 | **Připomínka vrácení klienta** | `client_stats`, denní job, zpráva „je čas na další návštěvu“ s odkazem, nastavení salonu | Testovací klient s historií dostane připomínku ve správný den, jen jednou za cyklus |
| 8 | **Věrnostní program (jednoduchý)** | Jedno pravidlo N návštěv → odměna, razítka za proběhlé, ruční uplatnění, věrnostní karty v zákaznickém účtu | Razítka přibývají jen po `completed`, odměnu lze uplatnit a vrátit |
| 9 | **Mini web salonu** | `<slug>.<doména>`: logo, fotky, služby, ceny, tým, otevírací doba, mapa, tlačítko Rezervovat, QR kód | Salon má hotovou stránku bez zásahu vývojáře |
| 10 | **Tarify a limity (minimum)** | `plans`, limity pracovníků/poboček, zobrazení tarifu; platby předplatného až ve fázi 2 | Free tarif omezí druhého pracovníka |
| 11 | **Pilot** | Prod prostředí, Sentry, zálohy, právní texty (obchodní podmínky, GDPR), onboarding 3–5 salonů, sběr zpětné vazby | Salony běží 4 týdny bez ztráty dat |

## Co v MVP není (záměrně)
Platby a Stripe, zálohy a no-show ochrana, poukazy, pokladna a finance, fakturace, sklad, provize a docházka, marketingové kampaně, mobilní aplikace Expo, AI asistent, vlastní formuláře/anamnézy, čekací listina, služby s pauzou, zdroje (židle/kabina), více pravidel věrnosti, body, vlastní doména salonu.
Datový model s většinou z nich počítá (viz `02-datovy-model.md` §8), tabulky se ale vytvoří až ve své fázi.

## Definition of done (každý krok)
- Funkce podle popisu, včetně chybových a prázdných stavů.
- Migrace + pgTAP test (RLS tam, kde jde o tenantová data).
- Typecheck, lint, unit a e2e test (pro klíčové cesty) zelené.
- Použitelné na telefonu, světlý i tmavý režim, `prefers-reduced-motion` respektováno.
- Texty v `packages/copy`, žádný název produktu natvrdo.
- `docs/` aktualizované, pokud se změnilo rozhodnutí.

## Návrh dělby práce (dvě osoby)
Aby se nepřepisovali, po základu (krok 0, dělá jeden) se dělí na dvojice nezávislých modulů:

| Osoba A (backend/data) | Osoba B (UI/frontend) |
|---|---|
| Dostupnost, rezervace, ověření, outbox, worker, statistiky | Design systém, kalendář UI, rezervační stránka, mini web, zákaznický účet |

Přesné dělení se domluví po výběru role kamaráda. Kroky 2–3 lze dělat souběžně, protože UI si nejdřív vezme kontrakty (typy, funkce) z `packages/db`.

## Odhad a rizika
- Největší rizika: **kalendář** (drag & drop, časové zóny), **dostupnost** (směny + pauzy + dovolené), **doručitelnost** e-mailů/push, **Apple přihlášení** (nastavení).
- Odhad délky uvádět až po kroku 0 a 1, kdy uvidíme skutečné tempo dvou lidí.
