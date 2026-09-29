# Terminio – deník rozhodnutí

Pracovní název: **Terminio** (možný rebrand; kód a texty proto nesmí obsahovat název natvrdo, jen přes konfiguraci).
Vize: „Operační systém pro váš salon“ – rezervace → klient → návštěva → platba → doklad → finance → marketing → další návštěva. Systém pracuje za majitele.

## Schváleno

| # | Téma | Rozhodnutí |
|---|------|------------|
| 1 | Tým | Dva lidé (majitel produktu + kamarád `zdendis27`), spolupráce na kódu, plus Claude jako pomocník |
| 2 | Trh | Všechny beauty segmenty od začátku, ale **obecné jádro** (služba = trvání + cena + zdroje). Speciální moduly (souhlasy tattoo, anamnézy, vlastní formuláře) až po MVP |
| 3 | Fakturace | Datový model hned, funkce ve fázi 3 |
| 4 | Mobil | Nejdřív PWA (majitel/zaměstnanci i zákazník), Expo až fáze 4 |
| 5 | Platby | Stripe Connect (peníze jdou přímo salonu, my nedržíme cizí peníze) |
| 6 | Jazyk | Česky natvrdo; texty ale centrálně v jednom souboru (levná pojistka) |
| 7 | Komunikace | **SMS jen pro přihlášení/ověření** (platí platforma). Upozornění a připomínky jdou přes **e-mail + push**. Pokud si salon koupí **tarif, který zahrnuje SMS**, posílají se upozornění i jako SMS (podle balíčku v tarifu) |
| 8 | Věrnostní program | Jednoduchá razítková karta už ve fázi 1, odměnu pevně určuje salon (služba zdarma / % / Kč), počítají se jen proběhlé návštěvy, platnost nastavuje salon (viz `01-vernostni-program.md`) |
| 9 | UI | Moderní, animované, hodně SVG, přehledné, jednoduché, profesionální (viz `03-ui-principy.md`); design systém ve fázi 0 |
| 10 | Věrnostní uplatnění | Odměnu vždy uplatňuje ručně pracovník/majitel |
| 11 | Zákaznický účet a ověření | Zákazník má **profil napříč salony**, přihlášení **Google / Apple / e-mail** od začátku, účet vzniká při první rezervaci. Ověření nastavuje salon: jen e-mail, nebo e-mail + telefon. Povoleno jen +420/+421. Opakované odeslání kódu ano. Ověřovací SMS platí platforma, konkrétní limity a ochrana proti zneužití v `02-datovy-model.md`. Zákazník vidí rezervace, věrnostní karty ze všech salonů, oblíbené |
| 12 | Potvrzování rezervací | Nastavuje se **na pobočce**: ručně nebo automaticky |
| 13 | Hlavní pracovník / provize | Rezervace má hlavního pracovníka; provize podle pravidel, která si nastavuje vlastník salonu |
| 14 | Repozitář a workflow | Sdílené repo `booking-crm-suite` (GitHub, `zdendis27`), commity **rovnou do `main`**, malé commity a `git pull --rebase` před pushem; viz `04-architektura.md` |
| 15 | Vývojová DB | Cloudový projekt Supabase (bez Dockeru); prod projekt samostatně před pilotem |
| 16 | Architektura a MVP | Viz `04-architektura.md` a `05-mvp-specifikace.md` (kroky 0–11) |
| 17 | SMS ověření | Ověření telefonu SMS se zatím neřeší, ověřuje se e-mail. Politika `email_phone` je v databázi připravená |
| 18 | Provize | Přednost má konkrétnější pravidlo (služba, produkt, kategorie, vše); při shodě pravidlo pracovníka před obecným |
| 19 | Databáze | Vývojový Supabase v regionu Irsko, přístup přes Session pooler; nasazuje se `pnpm --filter @repo/db db:migrate` |

## Fáze (k doladění)

0. Základ: rozhodnutí, datový model, monorepo, multi-tenancy, auth, design systém
1. MVP: služby, pracovníci, kalendář, online rezervace, klienti/CRM, e-mail/push připomínky, „je čas na další návštěvu“, mini web, (jednoduchá věrnost – viz rozhodnutí)
2. Peníze: pokladna, platby, Stripe, zálohy/no-show, poukazy, věrnost rozšířená, finance
3. Doklady: česká fakturace, sklad, provize, export pro účetní
4. Růst: kampaně, Expo, AI asistent, integrace s účetními systémy

## Technické zásady (od začátku)

- Multi-tenancy přes Postgres Row Level Security
- Ochrana proti dvojí rezervaci na úrovni DB (exclusion constraint na časových rozsazích)
- Časová zóna Europe/Prague, ukládat UTC
- Peníze jako celá čísla v haléřích
- Vystavené doklady neměnné, číslování bez mezer
- GDPR: rozlišit provozní zprávy (připomínka termínu) a obchodní sdělení (vracení klientů) – souhlas / výjimka pro stávající zákazníky + odhlášení

## Otevřené

- Finální název a ověření ochranné známky (ÚPV, EUIPO)
- Ceník a limity tarifů (včetně SMS)
- Detaily věrnostního programu
