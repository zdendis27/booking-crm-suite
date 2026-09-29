import { brand } from "@repo/copy";

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
}

const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "podpora@example.com";
const name = brand.name;

export const legalDocs: Record<string, LegalDoc> = {
  soukromi: {
    title: "Zásady ochrany osobních údajů",
    updated: "29. září 2026",
    intro: `Tyto zásady vysvětlují, jak ${name} zachází s osobními údaji klientů salonů i uživatelů systému. Osobní údaje zpracováváme v souladu s nařízením GDPR a zákonem č. 110/2019 Sb.`,
    sections: [
      {
        heading: "Kdo je správce a kdo zpracovatel",
        paragraphs: [
          `Údaje o klientech (jméno, kontakt, historie návštěv) spravuje konkrétní salon, u kterého se objednáváte. Salon je správcem těchto údajů a ${name} je jeho zpracovatelem.`,
          `Údaje o vašem uživatelském účtu (e-mail, přihlášení, ověření telefonu) spravujeme jako správce my, provozovatel služby ${name}.`,
        ],
      },
      {
        heading: "Jaké údaje zpracováváme",
        paragraphs: [
          "Identifikační a kontaktní údaje (jméno, e-mail, telefon), údaje o rezervacích a návštěvách, poznámky salonu, platby a doklady, nastavení souhlasů s marketingem a technické údaje nutné pro bezpečný provoz.",
          "Nikdy neukládáme čísla platebních karet. Platby zpracovává Stripe.",
        ],
      },
      {
        heading: "Proč údaje zpracováváme",
        paragraphs: [
          "Pro plnění smlouvy: vytvoření a správa rezervace, zaslání potvrzení a připomínky termínu.",
          "Ze zákona: vystavování a uchovávání daňových dokladů.",
          "Na základě souhlasu: marketingová sdělení, narozeninové nabídky a připomínky k další návštěvě. Souhlas můžete kdykoli odvolat v odkazu v e-mailu nebo u salonu.",
          "Z oprávněného zájmu: zabezpečení služby, prevence zneužití a předcházení nedorazivším klientům.",
        ],
      },
      {
        heading: "Komu údaje předáváme",
        paragraphs: [
          "Pouze poskytovatelům, které nutně potřebujeme: hosting a databáze (Supabase), odesílání e-mailů (Resend), platby (Stripe) a případně odesílání SMS. S nimi máme uzavřené zpracovatelské smlouvy.",
        ],
      },
      {
        heading: "Jak dlouho údaje uchováváme",
        paragraphs: [
          "Údaje o klientech uchovává salon po dobu trvání vztahu a poté nezbytnou dobu podle zákona. Daňové doklady se uchovávají po dobu stanovenou právními předpisy. Nepotřebné údaje anonymizujeme.",
        ],
      },
      {
        heading: "Vaše práva",
        paragraphs: [
          "Máte právo na přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost a právo vznést námitku. Žádost adresujte salonu, nebo nám na " + support + ". Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů.",
        ],
      },
    ],
  },
  zpracovani: {
    title: "Zpracovatelská smlouva",
    updated: "29. září 2026",
    intro: `Tato smlouva upravuje zpracování osobních údajů, které salon (správce) svěřuje provozovateli služby ${name} (zpracovatel) podle čl. 28 GDPR. Uzavírá se automaticky při založení salonu.`,
    sections: [
      {
        heading: "Předmět a doba zpracování",
        paragraphs: [
          `Zpracovatel zpracovává osobní údaje klientů salonu za účelem provozu rezervačního a evidenčního systému po dobu trvání smluvního vztahu mezi salonem a ${name}.`,
        ],
      },
      {
        heading: "Povaha a účel zpracování",
        paragraphs: [
          "Ukládání, organizace a zobrazování údajů, odesílání upozornění klientům, vystavování dokladů a tvorba přehledů. Zpracování probíhá výhradně podle pokynů správce.",
        ],
      },
      {
        heading: "Kategorie údajů a subjektů",
        paragraphs: ["Klienti salonu a jejich kontaktní údaje, historie rezervací, poznámky a platby. Zaměstnanci a spolupracovníci salonu a jejich pracovní údaje."],
      },
      {
        heading: "Povinnosti zpracovatele",
        paragraphs: [
          "Zpracovávat údaje jen na základě pokynů správce, zajistit mlčenlivost oprávněných osob, přijmout přiměřená technická a organizační opatření (šifrování přenosu, řízení přístupu na úrovni řádků databáze, zálohy), pomáhat správci při plnění práv subjektů a hlásit porušení zabezpečení bez zbytečného odkladu.",
          "Po ukončení služby údaje na žádost správce vrátí nebo vymaže. Správce má k dispozici export dat v CSV.",
        ],
      },
      {
        heading: "Další zpracovatelé",
        paragraphs: ["Správce uděluje obecný souhlas s využitím dalších zpracovatelů: Supabase (databáze a hosting), Resend (e-mail), Stripe (platby). O změně zpracovatelů bude správce informován předem."],
      },
    ],
  },
  podminky: {
    title: "Všeobecné obchodní podmínky",
    updated: "29. září 2026",
    intro: `Tyto podmínky upravují používání služby ${name} salony i klienty, kteří si přes ni rezervují termíny.`,
    sections: [
      {
        heading: "Služba",
        paragraphs: [
          `${name} je softwarová služba pro správu rezervací, klientů, plateb a dokladů salonů. Poskytovatelem služeb (kadeřnictví, kosmetika apod.) je vždy konkrétní salon, ne ${name}.`,
        ],
      },
      {
        heading: "Rezervace klienta",
        paragraphs: [
          "Rezervací uzavíráte se salonem smlouvu o poskytnutí služby. Salon může rezervaci potvrdit automaticky nebo ručně. Zrušit nebo přesunout termín můžete podle storno podmínek salonu, které vidíte při rezervaci.",
          "Salon může požadovat zálohu. Nevyčerpaná záloha se vrací podle podmínek salonu.",
        ],
      },
      {
        heading: "Tarify a platby salonu",
        paragraphs: [
          "Salon si volí tarif podle aktuálního ceníku. Placené tarify se účtují měsíčně přes Stripe a lze je kdykoli zrušit s účinností ke konci zaplaceného období. Ceny jsou uvedeny bez DPH.",
        ],
      },
      {
        heading: "Povinnosti uživatele",
        paragraphs: [
          "Uživatel poskytuje pravdivé údaje, chrání své přihlašovací údaje a nezneužívá službu. Salon odpovídá za zákonnost zpracování údajů svých klientů a za to, že klienty informoval o zpracování.",
        ],
      },
      {
        heading: "Odpovědnost a dostupnost",
        paragraphs: [
          "Usilujeme o nepřetržitý provoz, ale nemůžeme zaručit bezchybnost. Odpovědnost za škodu je omezena do výše ceny služby zaplacené za posledních 12 měsíců, pokud zákon nestanoví jinak.",
        ],
      },
      {
        heading: "Kontakt a řešení sporů",
        paragraphs: ["Dotazy a reklamace posílejte na " + support + ". Spory řeší příslušné soudy České republiky. Spotřebitel se může obrátit na Českou obchodní inspekci (adr.coi.cz)."],
      },
    ],
  },
};
