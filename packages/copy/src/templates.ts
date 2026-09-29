export interface TemplateDefault {
  subject: string;
  body: string;
  sms: string;
  pushTitle: string;
  pushBody: string;
}

export const templateVariables = [
  { key: "first_name", label: "Jméno klienta" },
  { key: "salon", label: "Název salonu" },
  { key: "date", label: "Datum" },
  { key: "time", label: "Čas" },
  { key: "services", label: "Služby" },
  { key: "staff", label: "Pracovník" },
  { key: "address", label: "Adresa" },
  { key: "manage_link", label: "Odkaz na správu rezervace" },
  { key: "book_link", label: "Odkaz na rezervaci" },
];

export const defaultTemplates: Record<string, TemplateDefault> = {
  booking_confirmation: {
    subject: "Rezervace potvrzena: {{date}} v {{time}}",
    body: "Dobrý den {{first_name}},\n\nvaše rezervace v salonu {{salon}} je potvrzena.\n\nTermín: {{date}} v {{time}}\nSlužby: {{services}}\nPracovník: {{staff}}\nAdresa: {{address}}\n\nRezervaci můžete změnit nebo zrušit zde:\n{{manage_link}}\n\nTěšíme se na vás!",
    sms: "{{salon}}: rezervace potvrzena na {{date}} v {{time}}. Změna: {{manage_link}}",
    pushTitle: "Rezervace potvrzena",
    pushBody: "{{salon}} · {{date}} v {{time}}",
  },
  booking_received: {
    subject: "Rezervace přijata: čeká na potvrzení",
    body: "Dobrý den {{first_name}},\n\nděkujeme za rezervaci v salonu {{salon}} na {{date}} v {{time}}. Salon ji co nejdříve potvrdí a dáme vám vědět.\n\nStav rezervace: {{manage_link}}",
    sms: "{{salon}}: rezervace na {{date}} {{time}} přijata, čeká na potvrzení.",
    pushTitle: "Rezervace přijata",
    pushBody: "Čeká na potvrzení salonem.",
  },
  booking_reminder: {
    subject: "Připomínka: {{date}} v {{time}} u {{salon}}",
    body: "Dobrý den {{first_name}},\n\nnezapomeňte na svůj termín {{date}} v {{time}} v salonu {{salon}}.\nSlužby: {{services}}\nAdresa: {{address}}\n\nNemůžete přijít? Změňte nebo zrušte termín včas:\n{{manage_link}}",
    sms: "{{salon}}: připomínáme termín {{date}} v {{time}}. Změna: {{manage_link}}",
    pushTitle: "Zítra máte termín",
    pushBody: "{{salon}} · {{date}} v {{time}}",
  },
  booking_cancellation: {
    subject: "Rezervace zrušena",
    body: "Dobrý den {{first_name}},\n\nvaše rezervace {{date}} v {{time}} v salonu {{salon}} byla zrušena.\n\nNový termín si můžete vybrat zde:\n{{book_link}}",
    sms: "{{salon}}: rezervace {{date}} {{time}} zrušena. Nový termín: {{book_link}}",
    pushTitle: "Rezervace zrušena",
    pushBody: "{{salon}} · {{date}} v {{time}}",
  },
  booking_rescheduled: {
    subject: "Změna termínu: {{date}} v {{time}}",
    body: "Dobrý den {{first_name}},\n\ntermín vaší rezervace v salonu {{salon}} byl změněn.\n\nNový termín: {{date}} v {{time}}\nSlužby: {{services}}\n\nSprávu rezervace najdete zde: {{manage_link}}",
    sms: "{{salon}}: nový termín {{date}} v {{time}}.",
    pushTitle: "Termín změněn",
    pushBody: "{{salon}} · {{date}} v {{time}}",
  },
  return_reminder: {
    subject: "{{first_name}}, je čas na další návštěvu",
    body: "Dobrý den {{first_name}},\n\nuž je to {{days}} dní od vaší poslední návštěvy v salonu {{salon}}. Obvykle k nám chodíte přibližně každých {{interval}} dní, takže je pravděpodobně čas na další termín.{{reward_line}}\n\nObjednejte se zde:\n{{book_link}}",
    sms: "{{salon}}: {{first_name}}, je čas na další návštěvu. Objednejte se: {{book_link}}",
    pushTitle: "Je čas na další návštěvu",
    pushBody: "{{salon}} vám drží volný termín.",
  },
  followup: {
    subject: "Děkujeme za návštěvu",
    body: "Dobrý den {{first_name}},\n\nděkujeme, že jste dnes navštívili salon {{salon}}. Pokud budete mít jakýkoli dotaz nebo přání, ozvěte se nám.\n\nDalší termín si můžete rezervovat zde:\n{{book_link}}",
    sms: "{{salon}}: děkujeme za návštěvu! Další termín: {{book_link}}",
    pushTitle: "Děkujeme za návštěvu",
    pushBody: "{{salon}}",
  },
  review_request: {
    subject: "Jak se vám u nás líbilo?",
    body: "Dobrý den {{first_name}},\n\nrádi bychom znali váš názor na návštěvu v salonu {{salon}}. Zabere to půl minuty a moc nám tím pomůžete:\n{{review_link}}\n\nDěkujeme!",
    sms: "{{salon}}: ohodnoťte nás, prosím: {{review_link}}",
    pushTitle: "Ohodnoťte návštěvu",
    pushBody: "{{salon}}",
  },
  birthday: {
    subject: "Všechno nejlepší, {{first_name}}!",
    body: "Dobrý den {{first_name}},\n\nvšechno nejlepší k narozeninám přeje tým salonu {{salon}}!{{offer_line}}\n\nRezervace: {{book_link}}",
    sms: "{{salon}}: všechno nejlepší, {{first_name}}! {{book_link}}",
    pushTitle: "Všechno nejlepší!",
    pushBody: "{{salon}} vám přeje krásný den.",
  },
  waitlist_offer: {
    subject: "Uvolnil se termín: {{date}} v {{time}}",
    body: "Dobrý den {{first_name}},\n\nuvolnil se termín, na který čekáte: {{date}} v {{time}} v salonu {{salon}}. Kdo dřív přijde, ten dřív bere:\n{{book_link}}",
    sms: "{{salon}}: uvolnil se termín {{date}} {{time}}. Rezervace: {{book_link}}",
    pushTitle: "Uvolnil se termín",
    pushBody: "{{salon}} · {{date}} v {{time}}",
  },
};

export function renderTemplate(template: string, variables: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
