import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, type Db } from "./support/harness";
import { pragueTs, seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;
let counter = 0;

const call = <T = unknown>(sql: string, params: unknown[] = [], user = s.ownerId) =>
  asUser(db, user, (tx) => tx.query<T>(sql, params));

async function booking(services = [s.serviceId], client = s.clientId) {
  const date = new Date(`${s.monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7 * counter++);
  const r = await call<{ id: string }>(
    "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
    [
      s.locationId,
      client,
      JSON.stringify(services.map((service_id) => ({ service_id, staff_id: s.staffId }))),
      pragueTs(date.toISOString().slice(0, 10), "10:00"),
    ],
  );
  return r.rows[0]!.id;
}

const complete = (id: string) => call("select public.set_booking_status($1, 'completed')", [id]);

async function product(name: string, stock: number, min = 2, price = 25000) {
  const r = await db.query<{ id: string }>(
    "insert into public.products (salon_id, name, sale_price, purchase_price, stock, min_stock, vat_rate) values ($1, $2, $3, 10000, $4, $5, 21) returning id",
    [s.salonId, name, price, stock, min],
  );
  return r.rows[0]!.id;
}

const stock = async (id: string) =>
  (await db.query<{ stock: number }>("select stock from public.products where id = $1", [id])).rows[0]!.stock;

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "inventory");
});

afterAll(async () => {
  await db.close();
});

describe("sklad", () => {
  it("prodej odečte zásobu, přičte se k zůstatku a vrácení ji obnoví", async () => {
    const p = await product("Šampon", 5);
    const b = await booking();
    const line = await call<{ id: string }>("select public.add_booking_product($1, $2, 2) as id", [b, p]);
    expect(await stock(p)).toBe(3);
    const bal = await db.query<{ b: string }>("select public.booking_balance($1) as b", [b]);
    expect(Number(bal.rows[0]!.b)).toBe(45000 + 50000);
    await call("select public.remove_booking_product($1)", [line.rows[0]!.id]);
    expect(await stock(p)).toBe(5);
  });

  it("nelze prodat víc, než je skladem", async () => {
    const p = await product("Vosk", 1);
    const b = await booking();
    await expect(call("select public.add_booking_product($1, $2, 2)", [b, p])).rejects.toThrow(/insufficient_stock/);
    expect(await stock(p)).toBe(1);
  });

  it("pokles pod minimum vytvoří upozornění majiteli", async () => {
    const p = await product("Olej", 3, 2);
    const b = await booking();
    await call("select public.add_booking_product($1, $2, 2)", [b, p]);
    const inbox = await call<{ type: string }>("select type from public.notifications where channel = 'in_app'");
    expect(inbox.rows.some((r) => r.type === "low_stock")).toBe(true);
    const low = await call<{ id: string }>("select id from public.low_stock_products($1)", [s.salonId]);
    expect(low.rows.map((r) => r.id)).toContain(p);
  });

  it("příjem objednávky naskladní zboží a založí výdaj", async () => {
    const p = await product("Gel", 0, 5);
    const order = await call<{ id: string }>(
      "select public.create_purchase_order($1, null, $2::jsonb) as id",
      [s.salonId, JSON.stringify([{ product_id: p, quantity: 10, unit_cost: 8000 }])],
    );
    await call("select public.receive_purchase_order($1)", [order.rows[0]!.id]);
    expect(await stock(p)).toBe(10);
    const expense = await db.query<{ amount: string }>("select amount from public.expenses where salon_id = $1 and category = 'zbozi'", [s.salonId]);
    expect(Number(expense.rows[0]!.amount)).toBe(80000);
  });

  it("tarif bez skladu ho nepovolí", async () => {
    const solo = await seedSalon(db, "inventory-solo", { plan: "solo" });
    const r = await db.query<{ id: string }>(
      "insert into public.products (salon_id, name, stock) values ($1, 'X', 5) returning id",
      [solo.salonId],
    );
    await expect(call("select public.adjust_stock($1, 1, 'adjustment')", [r.rows[0]!.id], solo.ownerId)).rejects.toThrow(/plan_feature_inventory/);
  });
});

describe("provize", () => {
  it("vypočítá procento z ceny po slevě při dokončení a smaže při vrácení", async () => {
    await db.query(
      "insert into public.staff_commission_rules (salon_id, staff_id, scope, type, percent) values ($1, $2, 'all', 'percent', 40)",
      [s.salonId, s.staffId],
    );
    const b = await booking();
    await call("select public.add_booking_adjustment($1, 'manual', 'Sleva', -5000)", [b]);
    await complete(b);
    const entry = await db.query<{ base_amount: string; amount: string }>(
      "select base_amount, amount from public.commission_entries where booking_id = $1",
      [b],
    );
    expect(Number(entry.rows[0]!.base_amount)).toBe(40000);
    expect(Number(entry.rows[0]!.amount)).toBe(16000);
    await call("select public.set_booking_status($1, 'confirmed')", [b]);
    const gone = await db.query("select 1 from public.commission_entries where booking_id = $1", [b]);
    expect(gone.rows).toHaveLength(0);
  });

  it("konkrétnější pravidlo (služba) má přednost před obecným", async () => {
    await db.query(
      "insert into public.staff_commission_rules (salon_id, staff_id, scope, service_id, type, percent) values ($1, $2, 'service', $3, 'percent', 60)",
      [s.salonId, s.staffId, s.shortServiceId],
    );
    const b = await booking([s.serviceId, s.shortServiceId]);
    await complete(b);
    const rows = await db.query<{ description: string; amount: string }>(
      "select description, amount from public.commission_entries where booking_id = $1 order by description",
      [b],
    );
    const byName = Object.fromEntries(rows.rows.map((r) => [r.description, Number(r.amount)]));
    expect(byName["Střih"]).toBe(18000);
    expect(byName["Vousy"]).toBe(12000);
  });

  it("prodané produkty se do provize započítají po přidání i u dokončené rezervace", async () => {
    const p = await product("Pomáda", 10);
    await db.query(
      "insert into public.staff_commission_rules (salon_id, scope, product_id, type, percent) values ($1, 'product', $2, 'percent', 10)",
      [s.salonId, p],
    );
    const b = await booking();
    await complete(b);
    await call("select public.add_booking_product($1, $2, 2)", [b, p]);
    const entry = await db.query<{ amount: string }>(
      "select amount from public.commission_entries where booking_id = $1 and source = 'product'",
      [b],
    );
    expect(Number(entry.rows[0]!.amount)).toBe(5000);
  });

  it("výplata sečte nevyplacené provize a druhá výplata stejného období selže", async () => {
    const payout = await call<{ id: string }>("select public.create_commission_payout($1, '2020-01-01', '2100-01-01') as id", [s.staffId]);
    const row = await db.query<{ total: string; status: string }>("select total, status from public.commission_payouts where id = $1", [payout.rows[0]!.id]);
    expect(Number(row.rows[0]!.total)).toBeGreaterThan(0);
    await expect(call("select public.create_commission_payout($1, '2020-01-01', '2100-01-01')", [s.staffId])).rejects.toThrow(/nothing_to_pay/);
    await call("select public.mark_payout_paid($1)", [payout.rows[0]!.id]);
  });

  it("pracovník vidí jen své provize", async () => {
    const mine = await call<{ id: string }>("select id from public.commission_entries", [], s.staffUserId);
    expect(mine.rows.length).toBeGreaterThan(0);
    const other = await seedSalon(db, "inventory-other");
    const theirs = await call<{ id: string }>("select id from public.commission_entries", [], other.staffUserId);
    expect(theirs.rows).toHaveLength(0);
  });
});

describe("docházka", () => {
  it("pracovník se může přihlásit a odhlásit, dvojí příchod se odmítne", async () => {
    await call("select public.clock_in($1)", [s.staffId], s.staffUserId);
    await expect(call("select public.clock_in($1)", [s.staffId], s.staffUserId)).rejects.toThrow(/already_clocked_in/);
    await call("select public.clock_out($1)", [s.staffId], s.staffUserId);
    await expect(call("select public.clock_out($1)", [s.staffId], s.staffUserId)).rejects.toThrow(/not_clocked_in/);
  });
});
