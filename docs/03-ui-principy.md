# Terminio – UI/UX principy (návrh)

Cíl: moderní, animovaná, přehledná, jednoduchá a profesionální aplikace. Pocit „prémiové moderní appky“, ne „administrace“.

## Zásady
1. **Jednoduchost před funkcemi.** Každá obrazovka má jednu hlavní akci. Pokročilé volby jsou schované.
2. **Animace mají význam.** Vysvětlují změnu (termín se přesune, karta se otevře, platba je úspěšná), nikdy nezdržují. Délka 150–300 ms, jemné „spring“ pohyby.
3. **SVG všude:** vlastní sada ikon (jednotný styl, tloušťka čáry), ilustrace prázdných stavů, animované potvrzení (zaškrtnutí, konfety při odměně), loadery, grafy.
4. **Rychlost je součást designu.** Rezervační stránka pro zákazníka musí být rychlá na levném telefonu (cíl LCP < 2,5 s). Animace nesmí brzdit.
5. **Přístupnost:** respektovat `prefers-reduced-motion`, kontrast WCAG AA, velké dotykové plochy, ovládání klávesnicí.
6. **Mobile-first.** Majitel a zaměstnanci ovládají hlavně telefon (PWA). Desktop je rozšíření.
7. **Světlý i tmavý režim** od začátku (design tokeny).

## Dvě „tváře“
- **Aplikace pro majitele/personál:** hustší, přehledná, kalendář jako hlavní obrazovka.
- **Zákaznická rezervace a mini web salonu:** lehká, krásná, **přizpůsobitelná** (logo, hlavní barva, fotky) přes design tokeny. Salon vypadá profesionálně, aniž by měl designéra.

## Doporučený technický základ (k potvrzení)
| Oblast | Návrh |
|---|---|
| Styling | Tailwind CSS + design tokeny (barvy, radius, stíny, typografie) |
| Komponenty | shadcn/ui (Radix) jako základ, vlastní vzhled nad ním |
| Animace | Motion (Framer Motion) pro přechody a gesta; CSS pro drobnosti |
| Ikony | vlastní/kurátorovaná SVG sada (Lucide jako základ, doplnit vlastní beauty ikony) |
| Ilustrace/animace | inline SVG; Lottie/Rive jen u pár klíčových momentů (výkon) |
| Grafy | lehká knihovna (Recharts nebo vlastní SVG) v jednotném stylu |
| Kalendář | vlastní komponenta (drag & drop, změna délky tažením), ne hotový kalendář |
| Písmo | moderní bezpatkové (např. Inter/Geist), české znaky ověřit |

## Postup
- Ve **fázi 0** vznikne **design systém**: tokeny, sada komponent, ikony, pravidla animací a živá ukázková stránka (galerie komponent).
- Před kódem hlavních obrazovek uděláme **návrhy klíčových obrazovek** (kalendář, detail rezervace, klient, dashboard, rezervační stránka, věrnostní karta) ke schválení.

## Rizika
- Sólo vývoj + hodně animací = riziko zdržení. Řešení: animace řešit centrálně (sdílené přechody), ne u každé obrazovky zvlášť.
- Výkon na starších telefonech. Řešení: rozpočet výkonu a testování na slabším zařízení.

## K rozhodnutí
- Styl: čistý světlý minimalismus / tmavý prémiový / barevnější „app“ styl? (návrh: čistý světlý základ + výrazná akcentní barva, tmavý režim navíc)
- Hlavní barva Terminia (pracovně, dá se změnit s rebrandem).
