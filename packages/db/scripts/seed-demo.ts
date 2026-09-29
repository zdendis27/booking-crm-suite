import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { loadEnv } from "./env";

loadEnv();

const SLUG = "studio-fade";
const reset = process.argv.includes("--reset");

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260929);
const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const chance = (p: number) => rand() < p;
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

const maleNames = ["Jan", "Petr", "Tomáš", "Martin", "Jakub", "Lukáš", "David", "Ondřej", "Filip", "Michal", "Adam", "Vojtěch", "Matěj", "Daniel", "Marek", "Radek", "Štěpán", "Patrik"];
const femaleNames = ["Petra", "Lucie", "Eva", "Kateřina", "Tereza", "Anna", "Jana", "Veronika", "Barbora", "Nikola", "Klára", "Markéta", "Adéla", "Zuzana", "Michaela"];
const surnames = ["Novák", "Svoboda", "Novotný", "Dvořák", "Černý", "Procházka", "Kučera", "Veselý", "Horák", "Němec", "Pokorný", "Marek", "Pospíšil", "Hájek", "Jelínek", "Král", "Růžička", "Beneš", "Fiala", "Sedláček"];

function dayString(offset: number, base = new Date()): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
  return d.toISOString().slice(0, 10);
}

function isoWeekday(day: string): number {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY!;
  const envFile = join(__dirname, "..", "..", "..", "apps", "web", ".env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let email = process.env.DEMO_EMAIL;
  let password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    email = "demo@example.com";
    password = randomBytes(12).toString("base64url");
    const existing = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
    if (!/^DEMO_EMAIL=/m.test(existing)) {
      appendFileSync(envFile, `${existing.endsWith("\n") ? "" : "\n"}DEMO_EMAIL=${email}\nDEMO_PASSWORD=${password}\n`);
    }
  }

  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list.data.users.find((u) => u.email === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Marek Fade" } });
    if (created.error) throw created.error;
    user = created.data.user!;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }
  const userId = user.id;

  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  const asOwner = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.query("set role authenticated");
  };
  const asAdmin = async () => {
    await db.query("reset role");
  };

  const existing = await q<{ id: string }>("select id from public.salons where slug = $1", [SLUG]);
  if (existing.length) {
    if (!reset) {
      console.log(`Demo salon '${SLUG}' už existuje. Pro nové vytvoření spusťte s --reset.`);
      await db.end();
      return;
    }
    await q("delete from public.salons where id = $1", [existing[0]!.id]);
    console.log("Původní demo salon smazán.");
  }

  await asOwner();
  const created = (await q<{ r: { salon_id: string; location_id: string; staff_id: string } }>(
    "select public.create_salon($1, $2, $3, 'barber', $4, $5, $6, $7) as r",
    ["Studio Fade", SLUG, "Praha Smíchov", "+420777123456", "Plzeňská 42", "Praha", "150 00"],
  ))[0]!.r;
  const salonId = created.salon_id;
  const loc1 = created.location_id;
  const ownerStaff = created.staff_id;

  await asAdmin();
  await q("update public.salons set plan_code = 'multi', status = 'active', description = $2, instagram = $3, website = $4, google_review_url = $5, brand_color = '#3056d3', email = 'ahoj@studiofade.cz' where id = $1", [
    salonId,
    "Moderní barbershop v srdci Smíchova. Precizní střihy, úprava vousů a klidná atmosféra. Objednejte se online během minuty.",
    "studiofade",
    "https://studiofade.cz",
    "https://g.page/r/studio-fade/review",
  ]);
  await q("update public.subscriptions set plan_code = 'multi', status = 'active' where salon_id = $1", [salonId]);
  await q("update public.salon_billing_profiles set legal_name = 'Marek Fade', ico = '12345678', dic = 'CZ12345678', vat_payer = true, address_street = 'Plzeňská 42', address_city = 'Praha', address_zip = '15000', iban = 'CZ6508000000192000145399', bank_account = '192000145399/0800', default_due_days = 14 where salon_id = $1", [salonId]);
  await asOwner();

  const loc2 = (await q<{ id: string }>(
    "insert into public.locations (salon_id, name, slug, address_street, address_city, address_zip, phone) values ($1, 'Praha Vinohrady', 'vinohrady', 'Korunní 88', 'Praha', '120 00', '+420777654321') returning id",
    [salonId],
  ))[0]!.id;
  await q("insert into public.location_booking_settings (location_id, salon_id, confirmation_mode) values ($1, $2, 'manual')", [loc2, salonId]);
  for (const weekday of [1, 2, 3, 4, 5]) {
    await q("insert into public.location_hours (salon_id, location_id, weekday, opens, closes) values ($1, $2, $3, '10:00', '19:00')", [salonId, loc2, weekday]);
  }
  await q("update public.location_hours set closes = '18:00' where location_id = $1 and weekday = 5", [loc1]);
  await q("insert into public.location_hours (salon_id, location_id, weekday, opens, closes) values ($1, $2, 6, '09:00', '14:00')", [salonId, loc1]);
  await q("update public.staff set display_name = 'Marek', title = 'Majitel a senior barber', color = '#3056d3', bio = 'Barberem od roku 2011. Specialista na fade a klasické střihy.' where id = $1", [ownerStaff]);

  const staffDefs = [
    { name: "Tomáš", title: "Barber", color: "#14b8a6", bio: "Přesné střihy a úprava vousů.", days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00", loc: loc1 },
    { name: "Lucie", title: "Barber a stylistka", color: "#ec4899", bio: "Dámské i pánské střihy, barvení.", days: [2, 3, 4, 5, 6], from: "10:00", to: "18:00", loc: loc1 },
    { name: "Jakub", title: "Junior barber", color: "#f59e0b", bio: "Nový talent našeho studia.", days: [1, 2, 3, 4, 5], from: "10:00", to: "19:00", loc: loc2 },
  ];
  const staffIds: { id: string; days: number[]; from: string; to: string; loc: string; name: string }[] = [
    { id: ownerStaff, days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "18:00", loc: loc1, name: "Marek" },
  ];
  await q("delete from public.staff_schedules where staff_id = $1", [ownerStaff]);
  for (const day of [1, 2, 3, 4, 5]) {
    await q("insert into public.staff_schedules (salon_id, staff_id, location_id, weekday, starts, ends) values ($1, $2, $3, $4, '09:00', '12:00'), ($1, $2, $3, $4, '13:00', '18:00')", [salonId, ownerStaff, loc1, day]);
  }
  await q("insert into public.staff_schedules (salon_id, staff_id, location_id, weekday, starts, ends) values ($1, $2, $3, 6, '09:00', '14:00')", [salonId, ownerStaff, loc1]);
  for (const def of staffDefs) {
    const id = (await q<{ id: string }>("insert into public.staff (salon_id, display_name, title, color, bio, sort) values ($1, $2, $3, $4, $5, $6) returning id", [salonId, def.name, def.title, def.color, def.bio, staffIds.length]))[0]!.id;
    await q("insert into public.staff_locations (staff_id, location_id, salon_id) values ($1, $2, $3)", [id, def.loc, salonId]);
    for (const day of def.days) {
      await q("insert into public.staff_schedules (salon_id, staff_id, location_id, weekday, starts, ends) values ($1, $2, $3, $4, $5, $6)", [salonId, id, def.loc, day, def.from, def.to]);
    }
    staffIds.push({ id, days: def.days, from: def.from, to: def.to, loc: def.loc, name: def.name });
  }
  await q("insert into public.staff_locations (staff_id, location_id, salon_id) values ($1, $2, $3) on conflict do nothing", [ownerStaff, loc2, salonId]);

  const cat = (await q<{ id: string }>("select id from public.service_categories where salon_id = $1 limit 1", [salonId]))[0]!.id;
  await q("insert into public.services (salon_id, category_id, name, description, duration_min, price, vat_rate, sort) values ($1, $2, 'Fade střih', 'Precizní přechod, dokončení břitvou', 45, 55000, 21, 1), ($1, $2, 'Dětský střih', 'Do 12 let', 20, 25000, 21, 5), ($1, $2, 'Barvení vousů', 'Přirozený odstín', 30, 30000, 21, 6), ($1, $2, 'Hot towel holení', 'Klasické holení s horkým ručníkem', 30, 35000, 21, 7)", [salonId, cat]);
  await q("update public.services set vat_rate = 21 where salon_id = $1", [salonId]);
  await q("update public.services set duration_min = 45, price = 60000 where salon_id = $1 and name = 'Střih a vousy'", [salonId]);
  const services = await q<{ id: string; name: string; duration_min: number; price: string }>("select id, name, duration_min, price from public.services where salon_id = $1 order by sort, name", [salonId]);
  const serviceByName = Object.fromEntries(services.map((s) => [s.name, s]));
  await q("update public.staff_services set price_override = 70000 where staff_id = $1 and service_id = $2", [ownerStaff, serviceByName["Fade střih"]!.id]);
  await q("update public.staff_services set price_override = 45000, duration_override = 60 where staff_id = $1 and service_id = $2", [staffIds[3]!.id, serviceByName["Fade střih"]!.id]);

  await q("insert into public.loyalty_programs (salon_id, name, threshold, reward_type, reward_service_id, reward_valid_months) values ($1, 'Věrnostní karta Studio Fade', 5, 'free_service', $2, 12)", [salonId, serviceByName["Střih"]!.id]);
  await q("insert into public.salon_commission_settings (salon_id, mode, base_mode) values ($1, 'per_item', 'gross_after_discount') on conflict (salon_id) do update set mode = 'per_item'", [salonId]);
  await q("insert into public.staff_commission_rules (salon_id, staff_id, scope, type, percent) values ($1, $2, 'all', 'percent', 50), ($1, $3, 'all', 'percent', 40), ($1, $4, 'all', 'percent', 40), ($1, $5, 'all', 'percent', 30)", [salonId, ownerStaff, staffIds[1]!.id, staffIds[2]!.id, staffIds[3]!.id]);
  await q("insert into public.automations (salon_id, type, enabled, channels) values ($1, 'followup', true, '{email}'), ($1, 'review_request', true, '{email}'), ($1, 'birthday', true, '{email,push}') on conflict (salon_id, type) do update set enabled = true", [salonId]);
  await q("insert into public.deposit_policies (salon_id, enabled, mode, value, only_new_clients, min_total) values ($1, false, 'percent', 30, true, 0) on conflict do nothing", [salonId]);

  const supplier = (await q<{ id: string }>("insert into public.suppliers (salon_id, name, email, phone) values ($1, 'Barber Supply CZ', 'objednavky@barbersupply.cz', '+420222333444') returning id", [salonId]))[0]!.id;
  const productDefs: [string, number, number, number, number, number][] = [
    ["Pomáda Matte Clay", 19900, 9500, 24, 5, 21],
    ["Olej na vousy Cedar", 24900, 11000, 18, 5, 21],
    ["Šampon Daily 250 ml", 18900, 8200, 2, 6, 21],
    ["Vosk na vlasy Strong", 17900, 8000, 30, 8, 21],
    ["Tonikum před holením", 22900, 10500, 3, 4, 21],
    ["Hřeben dřevěný", 12900, 5000, 14, 3, 21],
    ["Kartáč na vousy", 34900, 15500, 9, 3, 21],
    ["Dárková sada Fade", 89900, 41000, 6, 2, 21],
  ];
  const productIds: string[] = [];
  for (const [name, sale, buy, stock, min, vat] of productDefs) {
    const id = (await q<{ id: string }>(
      "insert into public.products (salon_id, name, sale_price, purchase_price, min_stock, vat_rate, supplier_id, sku) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
      [salonId, name, sale, buy, min, vat, supplier, `SKU-${productIds.length + 1}`],
    ))[0]!.id;
    await q("select public.adjust_stock($1, $2, 'purchase', 'Počáteční stav')", [id, stock + 20]);
    productIds.push(id);
  }

  const clients: { id: string; interval: number; lapsed: boolean; nextDue: number; preferred: string; favStaff: number }[] = [];
  const usedPhones = new Set<string>();
  for (let i = 0; i < 52; i++) {
    const female = chance(0.28);
    const first = pick(female ? femaleNames : maleNames);
    const last = pick(surnames) + (female ? "ová" : "").replace("ý", "á");
    const surname = female ? (last.endsWith("ová") ? last : last.replace(/(ý|á)$/, "á")) : last.replace("ová", "");
    let phone: string;
    do {
      phone = `+4207${between(20, 99)}${between(100, 999)}${between(100, 999)}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);
    const birthday = chance(0.6) ? `${between(1985, 2004)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}` : null;
    const regular = i < 30;
    const id = (await q<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name, phone, email, birthday, source) values ($1, $2, $3, $4, $5, $6, $7) returning id",
      [salonId, first, surname, phone, `${first}.${surname}${i}@example.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), birthday, chance(0.35) ? "online" : "admin"],
    ))[0]!.id;
    clients.push({
      id,
      interval: regular ? between(12, 35) : between(50, 120),
      lapsed: regular && i >= 24,
      nextDue: -between(0, 40) + between(0, 20) - 40,
      preferred: pick(["Střih", "Střih", "Střih a vousy", "Fade střih", "Vousy"]),
      favStaff: between(0, 3),
    });
  }
  for (const client of clients.slice(0, 20)) {
    await q("insert into public.client_consents (salon_id, client_id, type, source) values ($1, $2, 'marketing_email', 'online')", [salonId, client.id]);
  }
  await q("insert into public.client_notes (salon_id, client_id, author_id, body, pinned) values ($1, $2, $3, 'Preferuje kratší boky, alergie na parfémovaná tonika.', true), ($1, $4, $3, 'Chodí vždy v pátek odpoledne.', false)", [salonId, clients[0]!.id, userId, clients[1]!.id]);

  const today = dayString(0);
  const dayRange: string[] = [];
  for (let offset = -44; offset <= 9; offset++) dayRange.push(dayString(offset));

  const serviceOptions = [
    ["Střih"],
    ["Střih"],
    ["Střih"],
    ["Střih a vousy"],
    ["Střih a vousy"],
    ["Vousy"],
    ["Fade střih"],
    ["Fade střih", "Vousy"],
    ["Dětský střih"],
    ["Hot towel holení"],
    ["Barvení vousů"],
  ];

  const bookingIds: { id: string; day: string; status: string; total: number; clientIdx: number }[] = [];
  let created_count = 0;
  let sequence = 0;

  for (const day of dayRange) {
    const weekday = isoWeekday(day);
    const offset = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const dayEnd = offset < 0;
    for (const staff of staffIds) {
      if (!staff.days.includes(weekday)) continue;
      const [fh, fm] = staff.from.split(":").map(Number);
      const [th, tm] = staff.to.split(":").map(Number);
      let cursor = fh! * 60 + fm!;
      const end = th! * 60 + tm! - 30;
      const fill = weekday === 6 ? 0.8 : weekday === 5 ? 0.7 : 0.5;
      while (cursor < end) {
        if (chance(fill)) {
          const combo = pick(serviceOptions);
          const opts = combo.map((name) => serviceByName[name]).filter(Boolean);
          if (opts.length) {
            const dueClients = clients.filter((c) => !c.lapsed && c.nextDue <= offset);
            const pool = dueClients.length && chance(0.8) ? dueClients : clients.filter((c) => !c.lapsed);
            const clientIdx = clients.indexOf(pick(pool));
            const client = clients[clientIdx]!;
            const time = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`;
            const items = JSON.stringify(opts.map((s) => ({ service_id: s!.id, staff_id: staff.id })));
            const start = `${day} ${time}`;
            try {
              const source = chance(0.3) ? "online" : chance(0.15) ? "phone" : "admin";
              const status = offset >= 0 && chance(0.12) ? "pending" : "confirmed";
              const row = (await q<{ id: string }>(
                "select public.admin_create_booking($1, $2, $3::jsonb, ($4::timestamp at time zone 'Europe/Prague'), $5::public.booking_source, null, null, $6::public.booking_status) as id",
                [staff.loc, client.id, items, start, source, status],
              ))[0]!.id;
              created_count++;
              client.nextDue = offset + client.interval + between(-3, 4);
              const total = opts.reduce((sum, s) => sum + Number(s!.price), 0);
              let finalStatus = status;
              if (dayEnd) {
                const r = rand();
                if (r < 0.84) {
                  await q("select public.set_booking_status($1, 'completed')", [row]);
                  finalStatus = "completed";
                } else if (r < 0.91) {
                  await q("select public.set_booking_status($1, 'no_show', 'Nedostavil se')", [row]);
                  finalStatus = "no_show";
                } else {
                  await q("select public.set_booking_status($1, $2::public.booking_status, 'Změna plánů')", [row, chance(0.7) ? "cancelled_by_client" : "cancelled_by_salon"]);
                  finalStatus = "cancelled";
                }
              }
              bookingIds.push({ id: row, day, status: finalStatus, total, clientIdx });
              sequence++;
              cursor += opts.reduce((sum, s) => sum + s!.duration_min, 0) + pick([0, 0, 15, 15, 30]);
              continue;
            } catch (error) {
              if (!/slot_taken|slot_unavailable/.test((error as Error).message)) {
                console.log("Přeskočeno:", (error as Error).message);
              }
            }
          }
        }
        cursor += 15;
      }
    }
  }
  console.log(`Vytvořeno rezervací: ${created_count}`);

  const methods = ["card", "card", "card", "cash", "cash", "qr", "bank_transfer"];
  let paid = 0;
  for (const booking of bookingIds.filter((b) => b.status === "completed")) {
    if (chance(0.08)) continue;
    try {
      if (chance(0.16)) {
        await q("select public.add_booking_product($1, $2, $3)", [booking.id, pick(productIds), between(1, 2)]);
      }
      const balance = Number((await q<{ b: string }>("select public.booking_balance($1) as b", [booking.id]))[0]!.b);
      if (balance <= 0) continue;
      const method = pick(methods);
      const tip = chance(0.2) ? pick([2000, 3000, 5000, 10000]) : 0;
      if (chance(0.12)) {
        const first = Math.round(balance * 0.5);
        await q("select public.record_payment($1, $2, 'card')", [booking.id, first]);
        await q("select public.record_payment($1, $2, $3::public.payment_method, $4)", [booking.id, balance - first, "cash", tip]);
      } else {
        await q("select public.record_payment($1, $2, $3::public.payment_method, $4)", [booking.id, balance, method, tip]);
      }
      paid++;
    } catch (error) {
      console.log("Platba přeskočena:", (error as Error).message);
    }
  }
  console.log(`Zaplaceno rezervací: ${paid}`);

  const vouchers: string[] = [];
  for (const amount of [50000, 100000, 150000, 30000]) {
    vouchers.push((await q<{ id: string }>("select public.issue_voucher($1, $2, null, $3, $4, $5) as id", [salonId, amount, pick(femaleNames) + " " + pick(surnames) + "ová", null, "Vše nejlepší!"]))[0]!.id);
  }
  await q("select public.redeem_voucher($1, (select code from public.vouchers where id = $2), 20000, null)", [salonId, vouchers[0]]).catch(() => undefined);

  const months = [dayString(-2), dayString(-33)];
  for (const [index, date] of months.entries()) {
    await q("insert into public.expenses (salon_id, category, description, amount, method, incurred_on) values ($1, 'najem', 'Nájem provozovny', 2800000, 'bank_transfer', $2), ($1, 'energie', 'Elektřina a voda', 460000, 'bank_transfer', $2), ($1, 'marketing', 'Reklama na Instagramu', 350000, 'card', $2), ($1, 'zbozi', 'Objednávka kosmetiky', $3, 'card', $2), ($1, 'software', 'Účetní software', 89000, 'card', $2)", [salonId, date, 1200000 + index * 250000]);
  }

  const completed = bookingIds.filter((b) => b.status === "completed");
  for (const [index, booking] of completed.slice(-40, -34).entries()) {
    try {
      const invoice = (await q<{ id: string }>("select public.create_invoice_from_booking($1) as id", [booking.id]))[0]!.id;
      await q("select public.issue_invoice($1)", [invoice]);
      if (index < 3) {
        const balance = Number((await q<{ b: string }>("select public.invoice_balance($1) as b", [invoice]))[0]!.b);
        if (balance > 0) await q("select public.record_invoice_payment($1, $2, 'bank_transfer')", [invoice, balance]);
      }
      if (index === 5) await q("select public.create_credit_note($1, 'Reklamace služby')", [invoice]);
    } catch (error) {
      console.log("Faktura přeskočena:", (error as Error).message);
    }
  }
  try {
    const proforma = (await q<{ id: string }>(
      "select public.create_invoice($1, 'proforma', $2::jsonb, $3::jsonb) as id",
      [salonId, JSON.stringify({ name: "Firma Beta s.r.o.", ico: "27082440", dic: "CZ27082440", street: "Vinohradská 12", city: "Praha", zip: "12000", email: "ucetni@beta.example.com" }), JSON.stringify([{ description: "Firemní balíček střihů (10 ks)", quantity: 1, unit_price: 450000, vat_rate: 21 }])],
    ))[0]!.id;
    await q("select public.issue_invoice($1)", [proforma]);
  } catch (error) {
    console.log("Zálohová faktura přeskočena:", (error as Error).message);
  }

  await q("insert into public.promo_codes (salon_id, code, type, value, max_uses) values ($1, 'JARO10', 'percent', 10, 100), ($1, 'NOVACEK', 'fixed', 10000, 50)", [salonId]);
  await q("insert into public.waitlist_entries (salon_id, location_id, client_id, service_ids, date_from, date_to, time_from, time_to) values ($1, $2, $3, $4, $5, $6, '15:00', '19:00')", [salonId, loc1, clients[3]!.id, [serviceByName["Střih"]!.id], dayString(1), dayString(7)]);
  await q("insert into public.salon_reviews (salon_id, author, rating, body) values ($1, 'Jan K.', 5, 'Nejlepší fade v Praze, vždycky přesně na čas.'), ($1, 'Petr S.', 5, 'Skvělá atmosféra a super barbeři.'), ($1, 'Martin D.', 4, 'Spokojenost, jen občas chvíli čekání.'), ($1, 'Filip N.', 5, 'Online rezervace je hračka.')", [salonId]);
  await q("insert into public.campaigns (salon_id, name, channel, subject, body, segment, status) values ($1, 'Vraťte se k nám', 'email', 'Chybíte nám ve Studiu Fade', 'Ahoj {{first_name}}, už jsme se dlouho neviděli. Objednejte se online a získejte 10 % slevu s kódem JARO10.', '{\"inactive_days\":45}', 'draft')", [salonId]);
  await q("insert into public.staff_time_off (salon_id, staff_id, during, kind, note) values ($1, $2, tstzrange(($3::date + time '00:00') at time zone 'Europe/Prague', ($4::date + time '00:00') at time zone 'Europe/Prague', '[)'), 'vacation', 'Dovolená')", [salonId, staffIds[1]!.id, dayString(12), dayString(17)]);

  await asAdmin();
  await q("update public.payments p set paid_at = b.starts_at + interval '35 minutes' from public.bookings b where p.booking_id = b.id and p.salon_id = $1", [salonId]);
  await q("update public.clients c set created_at = coalesce((select min(b.starts_at) from public.bookings b where b.client_id = c.id), c.created_at) - interval '2 days' where c.salon_id = $1", [salonId]);
  await q("update public.loyalty_events e set created_at = b.starts_at from public.bookings b where e.booking_id = b.id and e.salon_id = $1", [salonId]);
  await q("update public.notifications set status = 'sent', sent_at = coalesce(sent_at, now() - interval '1 hour'), provider_id = 'demo' where salon_id = $1 and channel <> 'in_app' and status = 'queued' and random() < 0.75", [salonId]);
  await q("update public.notifications set status = 'cancelled' where salon_id = $1 and channel <> 'in_app' and status = 'queued'", [salonId]);
  await q("select public.enqueue_return_reminders()");
  await q("update public.notifications set status = 'sent', sent_at = now() where salon_id = $1 and type = 'return_reminder' and status = 'queued'", [salonId]);
  await q("insert into public.notifications (salon_id, user_id, channel, type, payload, status, sent_at, dedupe_key) values ($1, $2, 'in_app', 'low_stock', jsonb_build_object('name', 'Šampon Daily 250 ml', 'stock', 2), 'sent', now(), 'demo-lowstock'), ($1, $2, 'in_app', 'staff_new_booking', jsonb_build_object('client', jsonb_build_object('first_name', 'Petra', 'last_name', 'Nováková'), 'starts_at', (now() + interval '1 day')::text), 'sent', now() - interval '20 minutes', 'demo-new-1')", [salonId, userId]);
  await q("select public.grant_sms_credits($1, 500, 'Demo kredity')", [salonId]);

  const totals = await q<{ clients: string; bookings: string; payments: string }>(
    "select (select count(*) from public.clients where salon_id = $1) as clients, (select count(*) from public.bookings where salon_id = $1) as bookings, (select count(*) from public.payments where salon_id = $1) as payments",
    [salonId],
  );
  console.log(`Hotovo: ${totals[0]!.clients} klientů, ${totals[0]!.bookings} rezervací, ${totals[0]!.payments} plateb.`);
  console.log(`Demo účet: ${email} (heslo je v apps/web/.env.local jako DEMO_PASSWORD)`);
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
