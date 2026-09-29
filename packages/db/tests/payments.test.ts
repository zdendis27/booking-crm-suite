import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createUser, type Db } from "./support/harness";
import { pragueTs, seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;
let counter = 0;

const items = (...services: string[]) =>
  JSON.stringify(services.map((service_id) => ({ service_id, staff_id: s.staffId })));

async function booking(service = s.serviceId, time = "10:00"): Promise<string> {
  const date = new Date(`${s.monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7 * counter++);
  return asUser(db, s.ownerId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
      [s.locationId, s.clientId, items(service), pragueTs(date.toISOString().slice(0, 10), time)],
    );
    return r.rows[0]!.id;
  });
}

const pay = (bookingId: string, amount: number, method: string, tip = 0) =>
  asUser(db, s.ownerId, (tx) =>
    tx.query<{ id: string }>("select public.record_payment($1, $2, $3::public.payment_method, $4) as id", [
      bookingId,
      amount,
      method,
      tip,
    ]),
  );

const balance = async (bookingId: string) =>
  Number(
    (await db.query<{ b: string }>("select public.booking_balance($1) as b", [bookingId])).rows[0]!.b,
  );

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "payments");
});

afterAll(async () => {
  await db.close();
});

describe("platby", () => {
  it("zaplacení sníží zůstatek a spropitné se do něj nepočítá", async () => {
    const id = await booking();
    expect(await balance(id)).toBe(45000);
    await pay(id, 20000, "card", 5000);
    expect(await balance(id)).toBe(25000);
    await pay(id, 25000, "cash");
    expect(await balance(id)).toBe(0);
  });

  it("přeplatek se odmítne", async () => {
    const id = await booking();
    await expect(pay(id, 45001, "cash")).rejects.toThrow(/overpayment/);
  });

  it("poukaz a online platba nejdou zapsat přes ruční platbu", async () => {
    const id = await booking();
    await expect(pay(id, 100, "voucher")).rejects.toThrow(/invalid_method/);
    await expect(pay(id, 100, "online")).rejects.toThrow(/invalid_method/);
  });

  it("pracovník s rolí staff platbu zapsat nemůže", async () => {
    const id = await booking();
    await expect(
      asUser(db, s.staffUserId, (tx) => tx.query("select public.record_payment($1, 100, 'cash')", [id])),
    ).rejects.toThrow(/forbidden/);
  });

  it("refund vrátí částku, ale ne víc než bylo zaplaceno", async () => {
    const id = await booking();
    const payment = await pay(id, 45000, "card");
    const paymentId = payment.rows[0]!.id;
    await asUser(db, s.ownerId, (tx) => tx.query("select public.refund_payment($1, 10000, 'sleva')", [paymentId]));
    expect(await balance(id)).toBe(10000);
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.refund_payment($1, 40000, 'moc')", [paymentId])),
    ).rejects.toThrow(/invalid_amount/);
  });
});

describe("pokladna", () => {
  it("hotovost patří do otevřené směny a rozdíl se spočítá", async () => {
    const session = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ id: string }>("select public.open_cash_session($1, 100000) as id", [s.locationId]),
    );
    const sessionId = session.rows[0]!.id;
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.open_cash_session($1, 0)", [s.locationId])),
    ).rejects.toThrow(/session_already_open/);
    await pay(await booking(), 45000, "cash");
    await pay(await booking(), 45000, "card");
    const diff = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ d: string }>("select public.close_cash_session($1, 145000) as d", [sessionId]),
    );
    expect(Number(diff.rows[0]!.d)).toBe(0);
    const closed = await db.query<{ expected_cash: string }>("select expected_cash from public.cash_register_sessions where id = $1", [sessionId]);
    expect(Number(closed.rows[0]!.expected_cash)).toBe(145000);
  });
});

describe("dárkové poukazy", () => {
  it("vystaví se s unikátním kódem a zůstatkem", async () => {
    const voucher = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ id: string }>("select public.issue_voucher($1, 100000) as id", [s.salonId]),
    );
    const row = await db.query<{ code: string; balance: string }>("select code, balance from public.vouchers where id = $1", [voucher.rows[0]!.id]);
    expect(row.rows[0]!.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(Number(row.rows[0]!.balance)).toBe(100000);
  });

  it("uplatnění sníží zůstatek, zapíše platbu a nelze čerpat víc než zůstatek", async () => {
    const voucher = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ id: string }>("select public.issue_voucher($1, 60000) as id", [s.salonId]),
    );
    const { code } = (await db.query<{ code: string }>("select code from public.vouchers where id = $1", [voucher.rows[0]!.id])).rows[0]!;
    const id = await booking();
    await asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_voucher($1, $2, 45000, $3)", [s.salonId, code, id]));
    expect(await balance(id)).toBe(0);
    const left = await db.query<{ balance: string }>("select balance from public.vouchers where id = $1", [voucher.rows[0]!.id]);
    expect(Number(left.rows[0]!.balance)).toBe(15000);
    const next = await booking();
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_voucher($1, $2, 45000, $3)", [s.salonId, code, next])),
    ).rejects.toThrow(/invalid_amount/);
    await asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_voucher($1, $2, 15000, $3)", [s.salonId, code, next]));
    const used = await db.query<{ status: string }>("select status from public.vouchers where id = $1", [voucher.rows[0]!.id]);
    expect(used.rows[0]!.status).toBe("used");
  });

  it("poukaz z jiného salonu se nenajde", async () => {
    const other = await seedSalon(db, "payments-other");
    const voucher = await asUser(db, other.ownerId, (tx) =>
      tx.query<{ id: string }>("select public.issue_voucher($1, 10000) as id", [other.salonId]),
    );
    const { code } = (await db.query<{ code: string }>("select code from public.vouchers where id = $1", [voucher.rows[0]!.id])).rows[0]!;
    const id = await booking();
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_voucher($1, $2, 100, $3)", [s.salonId, code, id])),
    ).rejects.toThrow(/voucher_not_found/);
  });

  it("tarif FREE poukazy nepovoluje", async () => {
    const free = await seedSalon(db, "payments-free", { plan: "free" });
    await expect(
      asUser(db, free.ownerId, (tx) => tx.query("select public.issue_voucher($1, 10000)", [free.salonId])),
    ).rejects.toThrow(/plan_feature_vouchers/);
  });
});

describe("zálohy", () => {
  it("bez propojeného Stripe se záloha nevyžaduje", async () => {
    await db.query("insert into public.deposit_policies (salon_id, enabled, value) values ($1, true, 30)", [s.salonId]);
    const r = await db.query<{ d: string }>("select public._deposit_required($1, $2, 100000) as d", [s.salonId, s.clientId]);
    expect(Number(r.rows[0]!.d)).toBe(0);
  });

  it("s aktivním Stripe se záloha spočítá a platí jen pro nové klienty", async () => {
    await db.query(
      "insert into public.stripe_accounts (salon_id, stripe_account_id, charges_enabled) values ($1, 'acct_test', true)",
      [s.salonId],
    );
    const fresh = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name) values ($1, 'Nový', 'Klient') returning id",
      [s.salonId],
    );
    const due = await db.query<{ d: string }>("select public._deposit_required($1, $2, 100000) as d", [s.salonId, fresh.rows[0]!.id]);
    expect(Number(due.rows[0]!.d)).toBe(30000);
  });

  it("online rezervace se zálohou čeká na zaplacení a po platbě se potvrdí", async () => {
    const user = await createUser(db, "vklad@example.cz");
    const id = await asUser(db, user, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.customer_create_booking($1, $2::jsonb, $3::timestamptz) as id",
        [s.locationId, items(s.serviceId), pragueTs(s.monday, "09:00")],
      );
      return r.rows[0]!.id;
    });
    const row = await db.query<{ status: string; deposit_amount: string; expires_at: string | null }>(
      "select status, deposit_amount, expires_at from public.bookings where id = $1",
      [id],
    );
    expect(row.rows[0]!.status).toBe("pending");
    expect(Number(row.rows[0]!.deposit_amount)).toBe(13500);
    expect(row.rows[0]!.expires_at).not.toBeNull();
    await asService(db, (tx) =>
      tx.query("select public.record_stripe_payment($1, $2, 13500, 'pi_test_1', 'deposit')", [s.salonId, id]),
    );
    const paid = await db.query<{ status: string }>("select status from public.bookings where id = $1", [id]);
    expect(paid.rows[0]!.status).toBe("confirmed");
    await asService(db, (tx) =>
      tx.query("select public.record_stripe_payment($1, $2, 13500, 'pi_test_1', 'deposit')", [s.salonId, id]),
    );
    const payments = await db.query("select 1 from public.payments where stripe_payment_intent_id = 'pi_test_1'");
    expect(payments.rows).toHaveLength(1);
  });
});
