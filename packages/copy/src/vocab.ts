export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "pink";

export const bookingStatus: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Čeká na potvrzení", tone: "warning" },
  confirmed: { label: "Potvrzeno", tone: "accent" },
  completed: { label: "Proběhlo", tone: "success" },
  cancelled_by_client: { label: "Zrušil klient", tone: "neutral" },
  cancelled_by_salon: { label: "Zrušil salon", tone: "neutral" },
  no_show: { label: "Nedostavil se", tone: "danger" },
};

export const bookingSource: Record<string, string> = {
  online: "Online",
  admin: "V kalendáři",
  walk_in: "Bez objednání",
  phone: "Telefon",
};

export const paymentMethod: Record<string, string> = {
  card: "Karta",
  cash: "Hotovost",
  qr: "QR platba",
  bank_transfer: "Bankovní převod",
  online: "Online platba",
  voucher: "Dárkový poukaz",
  other: "Jiný způsob",
};

export const salonRole: Record<string, string> = {
  owner: "Majitel",
  manager: "Manažer",
  reception: "Recepce",
  staff: "Pracovník",
};

export const weekdayNames = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
export const weekdayShort = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

export const invoiceKind: Record<string, string> = {
  invoice: "Faktura",
  proforma: "Zálohová faktura",
  credit_note: "Dobropis",
};

export const invoiceStatus: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Koncept", tone: "neutral" },
  issued: { label: "Vystaveno", tone: "info" },
  partially_paid: { label: "Částečně uhrazeno", tone: "warning" },
  paid: { label: "Uhrazeno", tone: "success" },
  cancelled: { label: "Stornováno", tone: "neutral" },
};

export const planNames: Record<string, string> = {
  free: "FREE",
  solo: "SOLO",
  pro: "PRO",
  business: "BUSINESS",
  multi: "MULTI",
};

export const featureLabels: Record<string, string> = {
  loyalty: "Věrnostní program",
  automations: "Automatizace",
  waitlist: "Čekací listina",
  payments: "Platby",
  vouchers: "Dárkové poukazy",
  finance: "Finance a pokladna",
  deposits: "Zálohy",
  invoicing: "Fakturace",
  commissions: "Provize",
  marketing: "Marketing",
  ai: "AI asistent",
};

export const automationTypes: Record<string, { label: string; description: string }> = {
  booking_confirmation: { label: "Potvrzení rezervace", description: "Klient dostane potvrzení hned po rezervaci." },
  booking_received: { label: "Rezervace přijata", description: "Klient se dozví, že rezervace čeká na potvrzení salonem." },
  booking_reminder: { label: "Připomínka termínu", description: "Zpráva před návštěvou snižuje počet nedorazivších klientů." },
  booking_cancellation: { label: "Zrušení rezervace", description: "Potvrzení zrušení klientovi." },
  booking_rescheduled: { label: "Přesun rezervace", description: "Klient je informován o změně termínu." },
  return_reminder: { label: "Připomínka vrácení klienta", description: "Systém se naučí, jak často klient chodí, a včas ho pozve zpět." },
  followup: { label: "Poděkování po návštěvě", description: "Automatická zpráva po dokončené návštěvě." },
  review_request: { label: "Žádost o Google recenzi", description: "Po návštěvě požádá klienta o hodnocení." },
  birthday: { label: "Narozeninová nabídka", description: "Pozdrav a nabídka v den narozenin." },
  waitlist_offer: { label: "Nabídka volného termínu", description: "Uvolněný termín se automaticky nabídne čekajícím klientům." },
};

export const expenseCategories: Record<string, string> = {
  najem: "Nájem",
  energie: "Energie a služby",
  zbozi: "Zboží a materiál",
  mzdy: "Mzdy a provize",
  marketing: "Marketing",
  vybaveni: "Vybavení",
  software: "Software",
  ostatni: "Ostatní",
};

export const templates: { id: string; label: string; description: string }[] = [
  { id: "barber", label: "Barbershop", description: "Střih, vousy, střih a vousy" },
  { id: "hair", label: "Kadeřnictví", description: "Dámský a pánský střih, barvení" },
  { id: "nails", label: "Nehtové studio", description: "Manikúra, gel lak, pedikúra" },
  { id: "lashes", label: "Řasy a obočí", description: "Prodlužování, doplnění, úprava obočí" },
  { id: "cosmetics", label: "Kosmetika", description: "Ošetření pleti, čištění, masáž obličeje" },
  { id: "massage", label: "Masáže a wellness", description: "Klasická, sportovní, relaxační" },
  { id: "tattoo", label: "Tattoo a piercing", description: "Konzultace, piercing, tetování" },
];
