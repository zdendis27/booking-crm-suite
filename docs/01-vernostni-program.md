# Věrnostní program (razítková karta) – specifikace

Stav: návrh ke schválení. Dodání: **fáze 1 (jednoduchá verze)**, rozšíření ve fázi 2.

## Rozhodnutí
- Odměnu **pevně určuje salon** (ne klient a ne systém): služba zdarma, procentní sleva nebo pevná sleva v Kč.
- Počítají se **jen návštěvy označené jako proběhlé** (zrušené a no-show ne).
- Platnost razítek a odměn **nastavuje salon** (výchozí: bez expirace).
- Fáze 1: **jedno aktivní pravidlo** na salon. Fáze 2: více pravidel, body, VIP úrovně.

## Pravidlo (fáze 1)
| Pole | Popis |
|------|-------|
| `threshold` | počet započítaných návštěv (např. 5) |
| `reward_type` | `free_service` / `percent_discount` / `fixed_discount` |
| `reward_value` | služba (id), procenta, nebo částka v haléřích |
| `reward_scope` | na které služby lze odměnu uplatnit (všechny / vybrané) |
| `stamp_valid_months` | null = bez expirace |
| `reward_valid_months` | null = bez expirace |
| služba: `counts_for_loyalty` | vlajka na službě, výchozí ano |

Příklad: „5 návštěv → 6. střih zdarma“ = `threshold 5`, `free_service(Střih)`.

## Chování
1. Rezervace přejde na `completed` → přidá se 1 razítko (idempotentně, max. jednou na rezervaci).
2. Při dosažení `threshold` vznikne odměna (`available`) a klient dostane notifikaci.
3. Při další rezervaci pracovník/majitel odměnu uplatní; rezervace dostane slevovou položku, cena se uloží jako snímek.
4. Uplatněná („zdarma“) návštěva **nezískává razítko**, cyklus začíná znovu.
5. Návrat `completed → jiný stav` razítko vrátí (protizápis).

## Datový model (append-only)
- `loyalty_programs` – pravidla salonu
- `loyalty_events` – nezměnitelný záznam (`stamp_earned`, `reward_earned`, `reward_redeemed`, `stamp_expired`, `manual_adjustment` + důvod + autor). Stav se odvozuje ze součtu.
- `loyalty_rewards` – instance odměny (`available` / `redeemed` / `expired` / `revoked`), vazba na rezervaci při uplatnění
- Zůstává platné napříč pobočkami jednoho salonu.

## Zobrazení klientovi
- Na rezervační stránce po ověření telefonem/e-mailem (bez účtu, kód): „3/5 návštěv, další 2 do odměny“.
- E-mail po návštěvě: aktuální stav; při získání odměny CTA „Rezervovat“.
- Napojení na připomínku „je čas na další návštěvu“: odměna jako motivace.

## Ochrana proti zneužití
- Razítko vzniká jen potvrzením personálu, ne klientem.
- Ruční úpravy jen role majitel, vždy s důvodem a auditní stopou.

## Poznámky na později
- Sleva/odměna se ve fázi 3 na dokladu zobrazí jako slevová položka (DPH řešit při fakturaci).
- GDPR: razítka jsou součástí profilu klienta, mažou se s ním.

## Uplatnění odměny
- **Schváleno: ručně.** Odměnu vždy uplatňuje pracovník/majitel na konkrétní rezervaci (fáze 1 i dál, pokud se později nerozhodneme jinak).
