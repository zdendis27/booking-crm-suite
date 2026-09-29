# Terminio – datový model (návrh v1)

Stav: **návrh ke schválení**. PostgreSQL (Supabase). Fáze u tabulek říká, kdy se skutečně vytvoří; model s nimi ale počítá od začátku, aby se nemusel přestavovat.

## 0. Konvence (platí všude)

- Každá tenantová tabulka má `salon_id` (první sloupec ve všech indexech) a zapnuté **RLS**.
- Primární klíče `uuid`. Časy `timestamptz` (ukládáme UTC, zobrazujeme Europe/Prague). Každá tabulka má `created_at`, `updated_at`.
- **Peníze = `bigint` v haléřích**, měna `CZK` (sloupec `currency` u dokladů kvůli budoucnosti).
- **Snímky (snapshots):** rezervace a doklady si ukládají název, cenu, délku a DPH v době vzniku. Pozdější změna ceníku nemění historii.
- Nemazat, ale **archivovat** (`archived_at`) služby, pracovníky, pobočky. Klienti se anonymizují (GDPR), ne mažou fyzicky, aby seděla historie tržeb.
- Významné změny (storno, ruční úprava věrnosti, refund, změna údajů salonu) zapisuje **`audit_log`**.
- Telefon vždy v E.164 (`+420…`), e-mail lowercase.
- Stavy jako Postgres enumy, měnit opatrně; při nejistotě `text` + CHECK.

## 1. Tenant, uživatelé, role (fáze 1)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `salons` | name, slug (subdoména), timezone, status (`trial`/`active`/`suspended`), plan_id | Tenant = podnik (firma) |
| `salon_billing_profiles` | legal_name, ico, dic, vat_payer, address, iban, invoice_logo | Vytvořit prázdné hned; využije fakturace (F3) |
| `locations` | salon_id, name, address, lat/lng, phone, slug, archived_at | Pobočky; každý salon ≥ 1 |
| `location_hours` | location_id, weekday, opens, closes | Otevírací doba (víc intervalů/den) |
| `profiles` | user_id → auth.users, name, phone | Rozšíření Supabase auth |
| `memberships` | salon_id, user_id, role (`owner`/`manager`/`reception`/`staff`) | Kdo smí do salonu |
| `audit_log` | salon_id, actor, action, entity, entity_id, before, after | Append-only |

**Role:** `owner` vše včetně financí a nastavení · `manager` provoz + reporty, bez billingu · `reception` kalendář, klienti, platby · `staff` jen vlastní kalendář a vlastní klienti/tržby.
RLS pomocí funkce `current_salon_ids()` (z `memberships`); role se kontrolují v politikách u citlivých tabulek (finance, nastavení).

## 2. Pracovníci a dostupnost (fáze 1)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `staff` | salon_id, user_id (**nullable**), display_name, photo, color, bookable, archived_at | Pracovník ≠ uživatel; barber nemusí mít login |
| `staff_locations` | staff_id, location_id | Kde pracuje |
| `staff_schedules` | staff_id, location_id, weekday, starts, ends, valid_from, valid_to | Týdenní směny; víc řádků/den = pauza |
| `staff_schedule_overrides` | staff_id, date, starts, ends, kind (`extra`/`off`) | Výjimka pro konkrétní den |
| `staff_time_off` | staff_id, during (tstzrange), kind (`vacation`/`sick`/`block`), note | Dovolená, blokace termínů |
| `staff_busy_slots` | staff_id, during (tstzrange), kind (`booking`/`time_off`), booking_item_id | **Jádro ochrany proti dvojí rezervaci** (viz §4) |

Provize (`commission_percent`, pravidla podle služby/produktu) přijdou ve fázi 3 jako `staff_commission_rules`.

## 3. Služby (fáze 1)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `service_categories` | salon_id, name, sort | |
| `services` | category_id, name, description, duration_min, buffer_after_min, price, price_is_from (bool), online_bookable, counts_for_loyalty, vat_rate (rezerva), archived_at | |
| `staff_services` | staff_id, service_id, price_override, duration_override | Kdo co dělá a za kolik (různé ceny podle pracovníka) |

Připraveno do budoucna (ve fázi 1 se nevyplní): `services.processing_gap_start_min` / `processing_gap_min` pro služby s pauzou (barvení, kdy je pracovník mezitím volný). Model to zvládne díky tomu, že obsazenost je v `staff_busy_slots` (jedna položka rezervace může vytvořit 2 obsazené intervaly).

## 4. Rezervace (fáze 1)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `bookings` | salon_id, location_id, client_id, **primary_staff_id** (hlavní pracovník), status, starts_at, ends_at, source (`online`/`admin`/`walk_in`/`phone`), price_total, discount_total, client_note, internal_note, cancel_reason, cancelled_at, manage_token_hash, expires_at | `expires_at` = držení termínu při nezaplacené záloze (F2) |
| `booking_items` | booking_id, service_id, staff_id, position, starts_at, ends_at, name_snap, duration_snap, price_snap, vat_snap | Více služeb v jedné rezervaci; každá může mít jiného pracovníka |
| `booking_adjustments` | booking_id, kind (`loyalty_reward`/`promo`/`manual`), amount (záporné), ref_id | Slevové položky, věrnostní odměna sem |
| `location_booking_settings` | slot_interval_min, min_notice_h, max_advance_days, cancel_deadline_h, **confirmation_mode** (`auto`/`manual`) | Pravidla rezervace a storna. **Potvrzování nastavuje každá pobočka zvlášť** |

**Hlavní pracovník:** `bookings.primary_staff_id` určuje, kdo je u rezervace „hlavní“ (výchozí = pracovník první položky, lze změnit). Každá položka má navíc vlastního pracovníka. Jak se z toho počítá provize, nastavuje majitel (viz §8, fáze 3).

**Držení termínu:** nová online rezervace vzniká jako `pending` s `expires_at` (cca 10 min) a termín drží, dokud klient neověří e-mail a telefon (viz §5). Po vypršení se uvolní. Pak je `confirmed` (auto), nebo zůstane `pending` k potvrzení salonem (manual).

**Stavy:** `pending` → `confirmed` → `completed` | `cancelled_by_client` | `cancelled_by_salon` | `no_show`.
Přechody hlídá databáze/funkce, ne jen UI. `completed` spouští věrnost a statistiku klienta.

**Ochrana proti dvojí rezervaci:** rezervace se vytváří jednou transakcí, která vloží `booking_items` a odpovídající `staff_busy_slots`. Na `staff_busy_slots` je
`EXCLUDE USING gist (staff_id WITH =, during WITH &&)`.
Kdyby dva klienti klikli na stejný termín současně, druhý dostane konflikt (HTTP 409 „termín už je obsazený“), ne dvojitou rezervaci. Dovolená/blokace jde stejnou cestou.

**Dostupnost** se počítá jako *směny − dovolené − obsazené sloty*, ne ukládá.

**Čekací listina (fáze 2):** `waitlist_entries` (client, service, staff?, date range, status).

## 5. Klienti / CRM (fáze 1)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `clients` | salon_id, first_name, last_name, phone, email, **phone_verified_at**, **email_verified_at**, birthday, source, merged_into, anonymized_at | **Klient patří jednomu salonu** (izolace dat, GDPR). Unikátní `(salon_id, phone)` |
| `client_notes` | client_id, author, text, created_at | Časová osa poznámek, ne jedno pole |
| `client_consents` | client_id, type (`marketing_email`/`marketing_sms`/`marketing_push`/`terms`), granted_at, revoked_at, source, text_version | Důkaz souhlasu pro GDPR |
| `client_stats` | client_id, visits_count, total_spent, last_visit_at, avg_interval_days, next_expected_at, favorite_staff, favorite_service | Přepočítává se po `completed`; **zdroj pro připomínku vrácení klienta** |

Sloučení duplicitních klientů: `merged_into` + přesun rezervací a věrnosti.
Vlastní formuláře/anamnézy (tattoo, masáže): `client_forms` až po MVP jako konfigurovatelný modul.

### Zákaznický účet a ověření (schváleno)

Zákazník má **jeden profil (účet) napříč salony**. V aplikaci/PWA si vybere salon a rezervaci, vidí svoje rezervace, věrnostní karty a oblíbené. Rezervace je pak rychlá a jednoduchá.

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `customer_accounts` | user_id → auth.users, email, email_verified_at, email_is_relay, phone (+420/+421), phone_verified_at, first_name, last_name | **Globální identita zákazníka**, oddělená od `profiles` (personál). Jedna osoba může být zároveň zákazník i personál |
| `customer_favorites` | account_id, salon_id, staff_id?, service_id? | Oblíbené salony/pracovníci a „moje obvyklá rezervace“ pro rychlé zopakování |
| `client_verifications` | channel (`email`/`sms`), target, code_hash, expires_at, attempts, verified_at | Jednorázové kódy, jen hash, max. 5 pokusů, platnost 10 min |
| `clients.customer_account_id` | nullable | Záznam klienta v salonu se propojí s účtem; `unique (salon_id, customer_account_id)` |

**Přihlášení (schváleno od začátku):** **Google**, **Apple** nebo kód/odkaz na e-mail (bez hesla). Účet vzniká automaticky při první rezervaci (žádná zdlouhavá registrace). Sezení drží auth (Supabase Auth); tabulka „důvěryhodných zařízení“ tím odpadá.
- E-mail z Google/Apple je už ověřený, klient jej znovu nepotvrzuje.
- **Apple „Skrýt e-mail“:** Apple může dát zástupný (relay) e-mail. Ukládáme `email_is_relay`; párování s existujícím klientem pak probíhá přes telefon. Odesílací doména musí být zaregistrovaná u Apple, aby relay e-maily doručovaly.
- Spojení účtů: stejný ověřený e-mail z více poskytovatelů = jeden účet.
- Vyžaduje Apple Developer Program a nastavení Services ID + ověření domény (jednorázově při přípravě přihlášení).

**Ověření nastavuje salon** (`salons.verification_policy`):
- `email`: stačí ověřený e-mail,
- `email_phone`: e-mail i telefon.

Účet s již ověřeným telefonem projde v každém salonu bez dalšího ověřování. Pokud salon telefon vyžaduje a účet ho nemá, ověří se jednou a uloží na účet. Ověřovací SMS se tak platí jednou na zákazníka, ne na každý salon.

**Pravidla:**
- Povolená čísla jen **+420 a +421** (CHECK v DB i validace v aplikaci). Jiné země později.
- Opakované odeslání kódu: pauza 60 s, max. 5 kódů za hodinu na cíl, denní limit na IP a salon, ochrana proti botům.
- Změna e-mailu/telefonu vyžaduje nové ověření.
- Ověřovací SMS jsou provozní zprávy platformy, nečerpají SMS kredity salonu (fair-use limit).
- **Propojení s klientem salonu:** při první rezervaci u salonu vznikne `clients` záznam propojený s účtem, nebo se propojí existující klient podle *ověřeného* e-mailu/telefonu (nikdy podle neověřeného). Salon vidí jen údaje, které zákazník sdílí (jméno, e-mail, telefon), ne jiné salony ani jeho historii jinde.
- Rezervace vytvořená personálem bez účtu (telefonát, walk-in) je klient bez účtu; při první ověřené rezervaci se propojí.
- Zákazník vidí: nadcházející rezervace, historii, přeplánování/storno, oblíbené salony, **věrnostní karty ze všech salonů**, „rezervovat znovu“ jedním klikem.
- **Push:** zákazník s účtem a nainstalovanou PWA může dostávat push (zlepšuje doručitelnost připomínek); e-mail zůstává výchozí.
- **GDPR:** Terminio je správce údajů zákaznického účtu, salon je správce údajů svého klienta. Smazání účtu neruší záznamy salonu (anonymizace na žádost, s ohledem na zákonné povinnosti). Dopracovat v právních textech.
### Limity a ochrana ověřovacích SMS (schváleno, platí platforma)

Ověřování je součást zakládání účtu u nás (ne u pobočky), proto **ověřovací SMS platí Terminio** a salonům se nezapočítávají. Aby to nešlo zneužít (SMS pumping), platí:

| Pravidlo | Hodnota |
|---|---|
| Pořadí | Nejdřív ověřený e-mail (Google/Apple rovnou), až pak SMS; před SMS captcha (např. Cloudflare Turnstile) |
| Platnost kódu / pokusy | 10 min / max. 5 pokusů |
| Pauza mezi odesláním | 60 s |
| Na jedno telefonní číslo | max. 3 SMS/hod, 5/den |
| Na jeden účet | max. 5 SMS/den; změna ověřeného telefonu max. 2× za 30 dní |
| Na jednu IP | max. 10 SMS/den |
| Povolené země | jen +420, +421 |
| Celoplatformní denní rozpočet | start 300 SMS/den; při 80 % upozornění a automatické zpřísnění (captcha vždy, delší pauzy), tvrdý strop jako pojistka |
| Anomálie na salonu | > 50 nových účtů za hodinu z jednoho salonu = upozornění pro správce |

Hodnoty jsou **konfigurace, ne pevně v kódu**, aby se daly ladit podle skutečného provozu.
**Odhad nákladu:** přibližně 1 SMS na nového zákazníka (řádově 0,5–1 Kč) + ~10 % opakování. Při 10 000 nových zákaznících měsíčně jde zhruba o 5–10 tis. Kč. Bereme to jako akviziční náklad platformy a sledujeme „cena na aktivní účet“.
Vlastní SMS připomínky salonu (marketing, připomínky termínů) jsou samostatné a čerpají kredity salonu.
## 6. Komunikace a automatizace (fáze 1, SMS část fáze 2)

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `automations` | salon_id, type, enabled, config (jsonb) | Typy: `booking_reminder`, `return_reminder`, `followup`, `review_request`, `birthday` |
| `notification_templates` | salon_id, type, channel, subject, body | Salon může upravit text |
| `notifications` (outbox) | salon_id, client_id?, user_id?, channel (`email`/`push`/`sms`), type, payload, scheduled_for, sent_at, status, provider_id, error, **dedupe_key (unique)** | Fronta; worker ji zpracovává; `dedupe_key` brání dvojímu odeslání |
| `push_subscriptions` | user_id / client_id, endpoint, keys | Web push (PWA) |
| `sms_credits_ledger` | salon_id, delta, reason, ref | Append-only, zůstatek = součet (model hned, provoz dle tarifu) |

**Kanály:** e-mail výchozí, push pro majitele/zaměstnance a klienty s PWA, SMS volitelně (salon zapíná sám, spotřebovává kredity).
**Pravidla odesílání:** provozní zprávy (potvrzení, připomínka termínu) bez souhlasu; obchodní zprávy (vrácení klienta, narozeniny, kampaně) jen se souhlasem nebo výjimkou pro stávající zákazníky, vždy s odhlášením. Kontrola `client_consents` se dělá při vytváření notifikace.

**Připomínka vrácení klienta (`return_reminder`):**
1. `client_stats.avg_interval_days` = průměr intervalů posledních N proběhlých návštěv (min. 2–3 návštěvy).
2. `next_expected_at = last_visit_at + avg_interval`.
3. Pokud je `now > next_expected_at + tolerance` a klient nemá budoucí rezervaci a připomínka pro tento cyklus nebyla, vznikne notifikace s odkazem na rezervaci (případně zmínka o odměně).
4. Max. 1 připomínka na cyklus, druhá po delší době; salon může vypnout nebo upravit.

## 7. Věrnostní program (fáze 1)

Podle `01-vernostni-program.md`: `loyalty_programs`, `loyalty_events` (append-only), `loyalty_rewards`. `services.counts_for_loyalty`. Uplatnění ručně, zapíše se do `booking_adjustments`.

## 8. Rezervováno pro pozdější fáze (jen návrh, tabulky se zatím nevytvářejí)

| Fáze | Oblast | Tabulky |
|---|---|---|
| 2 | Platby | `payments` (booking?, client?, amount, method: card/cash/qr/transfer/online/voucher, status, stripe ids, tip, paid_at), `stripe_accounts` (Connect) |
| 2 | Zálohy/no-show | `deposit_policies`, `no_show_records` |
| 2 | Poukazy | `vouchers` (code, initial, balance), `voucher_transactions` (ledger) |
| 2 | Finance | `expenses`, `cash_register_sessions` |
| 3 | Fakturace | `invoice_series` (transakční číslování bez mezer), `invoices`, `invoice_items`, dobropisy jako typ dokladu, `invoice_payments` (párování) |
| 3 | Sklad | `products`, `suppliers`, `stock_movements`, `purchase_orders` |
| 3 | Provize | `staff_commission_rules`, `commission_payouts` – viz níže |
| 4 | Marketing | `campaigns`, `promo_codes`, `segments` |
| 4 | AI | `ai_conversations` (jen metadata; data se čtou přes kontrolovaná zobrazení) |

### Provize (návrh, fáze 3; **pravidla si nastavuje vlastník salonu**)

`staff_commission_rules`: scope (pracovník / pracovník × služba / kategorie / produkt), typ (`percent` / `fixed` / `none`), hodnota, případně stupňovité hranice (např. nad 100 000 Kč tržby vyšší %).
Nastavení vlastníka:
- **Kdo dostane provizi u více pracovníků:** *po položkách* (každý za svou službu), nebo *celou hlavní pracovník* (`primary_staff_id`).
- **Základ výpočtu:** cena po slevách/před slevou, s DPH/bez DPH, se spropitným/bez.
- **Věrnostní odměna a poukazy:** počítá se provize z plné ceny, nebo ze zaplacené částky.
- Snímek pravidla se ukládá při dokončení rezervace, takže pozdější změna % nepřepíše minulé provize.

## 9. Platforma a předplatné (fáze 1, minimum)

| Tabulka | Klíčové sloupce |
|---|---|
| `plans` | code (`free`/`solo`/`pro`/`business`/`multi`), limits (jsonb: staff, locations, sms_included, features) |
| `subscriptions` | salon_id, plan_id, stripe_subscription_id, status, period_end |

Limity tarifů se kontrolují v aplikaci i v DB u tvrdých limitů (počet pracovníků/poboček).

## 10. Bezpečnost

- Aplikace pro majitele/personál používá běžné Supabase klienty s RLS.
- **Veřejná rezervace nemá přímý přístup k tabulkám.** Prochází jen úzkými serverovými endpointy (výpis dostupnosti, vytvoření rezervace, správa přes token) s rate-limitem a ochranou proti botům.
- `manage_token` se ukládá jen jako hash.
- Přístup zaměstnance omezen na vlastní data přes RLS politiku, ne jen v UI.
- Zálohy databáze a testy RLS (pokus o čtení cizího salonu musí selhat) jsou součástí CI.

## 11. Rozhodnutí v tomto návrhu (ke schválení)

1. **Rezervace váže na pracovníka, ne na zdroj (židle/kabina).** Zdroje později jako nový sloupec + tabulka.
2. **Záznam klienta patří salonu, zákazník má globální účet** (jeden profil napříč salony, salon vidí jen sdílené údaje).
3. **Služba s pauzou (barvení):** model připraven, UI a logika po MVP.
4. **Více služeb v jedné rezervaci:** ano, od začátku.
5. **Zákazník má účet bez hesla; ověření (jen e-mail, nebo e-mail + telefon) nastavuje salon; povoleno +420/+421** (schváleno).
6b. **Potvrzování rezervací nastavuje každá pobočka:** ručně nebo automaticky (schváleno).
6c. **Hlavní pracovník rezervace** je nastavitelný, provize podle pravidel vlastníka (schváleno).
6. **Pracovník nemusí mít přihlášení.**
7. **Souhlasy klienta v samostatné tabulce s historií.**
8. **Obsazenost jako samostatná tabulka s exclusion constraintem.**

## 12. Otevřené otázky

*Vyřešeno:* ověření nastavuje salon, telefony jen +420/+421, opakované odeslání kódu ano, ověřovací SMS platí platforma (limity výše), zákaznický účet napříč salony, přihlášení přes Google/Apple/e-mail od začátku, potvrzování na pobočce, hlavní pracovník a provize dle vlastníka.

- **Přihlášení majitelů a personálu:** stejné metody (Google/Apple/e-mail) + doporučená 2FA pro role `owner`/`manager` (finance a osobní údaje). Potvrdit.