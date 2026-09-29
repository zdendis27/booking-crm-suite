import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, type Db } from "./support/harness";
import { pragueTs, seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;
let counter = 0;

const customer = JSON.stringify({ name: "Firma s.r.o.", ico: "12345678", dic: "CZ12345678", street: "Hlavní 1", city: "Praha", zip: "11000" });

const call = <T = unknown>(sql: string, params: unknown[] = [], user = s.ownerId) =>
  asUser(db, user, (tx) => tx.query<T>(sql, params));

async function draft(items: object[], kind: "invoice" | "proforma" = "invoice") {
  const r = await call<{ id: string }>(
    "select public.create_invoice($1, $2::public.invoice_kind, $3::jsonb, $4::jsonb) as id",
    [s.salonId, kind, customer, JSON.stringify(items)],
  );
  return r.rows[0]!.id;
}

async function issue(id: string, date = "2026-10-05") {
  const r = await call<{ n: string }>("select public.issue_invoice($1, $2::date) as n", [id, date]);
  return r.rows[0]!.n;
}

async function row(id: string) {
  return (
    await db.query<{
      status: string;
      total_gross: string;
      total_net: string;
      total_vat: string;
      number: string;
      paid_amount: string;
      due_date: string;
      vat_summary: { rate: number; base: number; vat: number; gross: number }[];
    }>("select status, total_gross, total_net, total_vat, number, paid_amount, due_date::text, vat_summary from public.invoices where id = $1", [id])
  ).rows[0]!;
}

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "invoicing");
  await db.query(
    `insert into public.salon_billing_profiles
       (salon_id, legal_name, ico, dic, vat_payer, address_street, address_city, address_zip, iban, default_due_days)
     values ($1, 'Salon s.r.o.', '87654321', 'CZ87654321', true, 'Dlouhá 5', 'Brno', '60200', 'CZ6508000000192000145399', 14)`,
    [s.salonId],
  );
  counter = 0;
});

afterAll(async () => {
  await db.close();
});

describe("vystavení faktury", () => {
  it("přidělí číslo bez mezer a spočítá DPH po sazbách", async () => {
    const first = await draft([
      { description: "Střih", quantity: 1, unit_price: 12100, vat_rate: 21 },
      { description: "Šampon", quantity: 2, unit_price: 11200, vat_rate: 12 },
    ]);
    const number1 = await issue(first);
    const second = await draft([{ description: "Služba", quantity: 1, unit_price: 10000, vat_rate: 0 }]);
    const number2 = await issue(second);
    expect(number1).toBe("FV20260001");
    expect(number2).toBe("FV20260002");
    const inv = await row(first);
    expect(Number(inv.total_gross)).toBe(34500);
    const summary = inv.vat_summary;
    const r21 = summary.find((x) => x.rate === 21)!;
    const r12 = summary.find((x) => x.rate === 12)!;
    expect(r21.base + r21.vat).toBe(12100);
    expect(r21.base).toBe(10000);
    expect(r12.gross).toBe(22400);
    expect(Number(inv.total_net) + Number(inv.total_vat)).toBe(34500);
    expect(inv.due_date).toBe("2026-10-19");
  });

  it("neúplné fakturační údaje vystavení zablokují", async () => {
    const other = await seedSalon(db, "invoicing-incomplete");
    const id = (
      await call<{ id: string }>(
        "select public.create_invoice($1, 'invoice', $2::jsonb, '[{\"description\":\"X\",\"unit_price\":100}]'::jsonb) as id",
        [other.salonId, customer],
        other.ownerId,
      )
    ).rows[0]!.id;
    await expect(call("select public.issue_invoice($1)", [id], other.ownerId)).rejects.toThrow(/billing_profile_incomplete/);
  });

  it("neplátce DPH nesmí fakturovat s DPH", async () => {
    const other = await seedSalon(db, "invoicing-nonpayer");
    await db.query(
      "insert into public.salon_billing_profiles (salon_id, legal_name, ico, vat_payer, address_street, address_city, address_zip) values ($1, 'Jan Novák', '11223344', false, 'A 1', 'Praha', '11000')",
      [other.salonId],
    );
    const id = (
      await call<{ id: string }>(
        "select public.create_invoice($1, 'invoice', $2::jsonb, '[{\"description\":\"X\",\"unit_price\":100,\"vat_rate\":21}]'::jsonb) as id",
        [other.salonId, customer],
        other.ownerId,
      )
    ).rows[0]!.id;
    await expect(call("select public.issue_invoice($1)", [id], other.ownerId)).rejects.toThrow(/vat_rate_not_allowed/);
  });

  it("prázdná faktura se nevystaví", async () => {
    const id = await draft([]);
    await expect(issue(id)).rejects.toThrow(/invoice_empty/);
  });

  it("tarif bez fakturace ji nepovolí", async () => {
    const free = await seedSalon(db, "invoicing-free", { plan: "solo" });
    await expect(
      call("select public.create_invoice($1, 'invoice', $2::jsonb, '[]'::jsonb)", [free.salonId, customer], free.ownerId),
    ).rejects.toThrow(/plan_feature_invoicing/);
  });
});

describe("neměnnost", () => {
  it("vystavenou fakturu nelze upravit ani smazat a položky také ne", async () => {
    const id = await draft([{ description: "Střih", quantity: 1, unit_price: 5000, vat_rate: 21 }]);
    await issue(id);
    await expect(call("update public.invoices set total_gross = 1 where id = $1", [id])).rejects.toThrow(/invoice_immutable/);
    await expect(call("update public.invoices set customer_name = 'Jiná' where id = $1", [id])).rejects.toThrow(/invoice_immutable/);
    await expect(call("delete from public.invoices where id = $1", [id])).resolves.toMatchObject({ affectedRows: 0 });
    await expect(call("update public.invoice_items set unit_price = 1 where invoice_id = $1", [id])).rejects.toThrow(/invoice_immutable/);
    await expect(call("delete from public.invoice_items where invoice_id = $1", [id])).rejects.toThrow(/invoice_immutable/);
  });

  it("koncept upravit lze", async () => {
    const id = await draft([{ description: "Střih", quantity: 1, unit_price: 5000, vat_rate: 21 }]);
    await call("update public.invoice_items set unit_price = 6000 where invoice_id = $1", [id]);
    await call("update public.invoices set note = 'poznámka' where id = $1", [id]);
  });
});

describe("úhrady a párování", () => {
  it("částečná a plná úhrada mění stav, přeplatek je odmítnut", async () => {
    const id = await draft([{ description: "Služba", quantity: 1, unit_price: 10000, vat_rate: 21 }]);
    await issue(id);
    await call("select public.record_invoice_payment($1, 4000, 'bank_transfer')", [id]);
    expect((await row(id)).status).toBe("partially_paid");
    await expect(call("select public.record_invoice_payment($1, 7000, 'cash')", [id])).rejects.toThrow(/invalid_amount/);
    await call("select public.record_invoice_payment($1, 6000, 'cash')", [id]);
    expect((await row(id)).status).toBe("paid");
    const payments = await db.query("select 1 from public.payments where invoice_id = $1", [id]);
    expect(payments.rows).toHaveLength(2);
  });

  it("platba z banky se spáruje podle variabilního symbolu a duplicitní import se ignoruje", async () => {
    const id = await draft([{ description: "Služba", quantity: 1, unit_price: 25000, vat_rate: 21 }]);
    const number = await issue(id);
    const vs = number.replace(/\D/g, "");
    const matched = await call<{ m: string | null }>("select public.match_bank_payment($1, $2, 25000, '2026-10-06', 'TX-1') as m", [s.salonId, vs]);
    expect(matched.rows[0]!.m).toBe(id);
    expect((await row(id)).status).toBe("paid");
    const again = await call<{ m: string | null }>("select public.match_bank_payment($1, $2, 25000, '2026-10-06', 'TX-1') as m", [s.salonId, vs]);
    expect(again.rows[0]!.m).toBeNull();
    const unknown = await call<{ m: string | null }>("select public.match_bank_payment($1, '999', 100, '2026-10-06', 'TX-2') as m", [s.salonId]);
    expect(unknown.rows[0]!.m).toBeNull();
  });

  it("QR platba obsahuje IBAN, částku a variabilní symbol", async () => {
    const id = await draft([{ description: "Služba", quantity: 1, unit_price: 45000, vat_rate: 21 }]);
    const number = await issue(id);
    const qr = await call<{ q: string }>("select public.invoice_spayd($1) as q", [id]);
    expect(qr.rows[0]!.q).toBe(
      `SPD*1.0*ACC:CZ6508000000192000145399*AM:450.00*CC:CZK*X-VS:${number.replace(/\D/g, "")}*MSG:${number}`,
    );
  });
});

describe("dobropis a záloha", () => {
  it("plný dobropis zruší fakturu a má záporné částky", async () => {
    const id = await draft([{ description: "Služba", quantity: 1, unit_price: 12100, vat_rate: 21 }]);
    await issue(id);
    const note = await call<{ id: string }>("select public.create_credit_note($1, 'Reklamace') as id", [id]);
    const credit = await row(note.rows[0]!.id);
    expect(credit.number).toMatch(/^DB2026/);
    expect(Number(credit.total_gross)).toBe(-12100);
    expect((await row(id)).status).toBe("cancelled");
    await expect(call("select public.create_credit_note($1, 'Znovu')", [id])).rejects.toThrow(/invalid_status/);
  });

  it("částečný dobropis nesmí přesáhnout fakturu", async () => {
    const id = await draft([{ description: "Služba", quantity: 1, unit_price: 10000, vat_rate: 21 }]);
    await issue(id);
    await expect(
      call("select public.create_credit_note($1, 'Moc', '[{\"description\":\"X\",\"quantity\":1,\"unit_price\":20000,\"vat_rate\":21}]'::jsonb)", [id]),
    ).rejects.toThrow(/credit_exceeds_invoice/);
    await call("select public.create_credit_note($1, 'Část', '[{\"description\":\"X\",\"quantity\":1,\"unit_price\":4000,\"vat_rate\":21}]'::jsonb)", [id]);
    expect((await row(id)).status).toBe("issued");
  });

  it("zaplacená zálohová faktura se odečte z konečné faktury", async () => {
    const proforma = await draft([{ description: "Záloha na službu", quantity: 1, unit_price: 30000, vat_rate: 21 }], "proforma");
    const number = await issue(proforma);
    expect(number).toMatch(/^ZF2026/);
    await call("select public.record_invoice_payment($1, 30000, 'bank_transfer')", [proforma]);
    const finalId = (await call<{ id: string }>("select public.convert_proforma($1) as id", [proforma])).rows[0]!.id;
    await issue(finalId);
    const final = await row(finalId);
    expect(Number(final.total_gross)).toBe(30000);
    expect(final.status).toBe("paid");
  });
});

describe("faktura z rezervace a výstupy", () => {
  it("rozpočítá slevu do položek", async () => {
    const date = new Date(`${s.monday}T00:00:00Z`);
    const booking = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, JSON.stringify([{ service_id: s.serviceId, staff_id: s.staffId }, { service_id: s.shortServiceId, staff_id: s.staffId }]), pragueTs(date.toISOString().slice(0, 10), "12:00")],
      );
      return r.rows[0]!.id;
    });
    await call("select public.add_booking_adjustment($1, 'manual', 'Sleva', -6500)", [booking]);
    const inv = (await call<{ id: string }>("select public.create_invoice_from_booking($1) as id", [booking])).rows[0]!.id;
    const gross = await db.query<{ total_gross: string }>("select total_gross from public.invoices where id = $1", [inv]);
    expect(Number(gross.rows[0]!.total_gross)).toBe(58500);
  });

  it("export a přehled po splatnosti vrací vystavené doklady", async () => {
    const exported = await call<{ number: string }>("select number from public.export_invoices($1, '2026-01-01', '2026-12-31')", [s.salonId]);
    expect(exported.rows.length).toBeGreaterThan(3);
    const late = await call("select * from public.overdue_invoices($1)", [s.salonId]);
    expect(Array.isArray(late.rows)).toBe(true);
  });
});
