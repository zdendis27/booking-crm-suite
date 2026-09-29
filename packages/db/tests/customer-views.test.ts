import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";
import { pragueTs, seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "views");
});

afterAll(async () => {
  await db.close();
});

describe("zákaznické přehledy", () => {
  it("zákazník vidí své rezervace napříč salony včetně informace, zda je lze měnit", async () => {
    const user = await createUser(db, "prehled@example.cz");
    const id = await asUser(db, user, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.customer_create_booking($1, $2::jsonb, $3::timestamptz) as id",
        [s.locationId, JSON.stringify([{ service_id: s.serviceId, staff_id: s.staffId }]), pragueTs(s.monday, "10:00")],
      );
      return r.rows[0]!.id;
    });
    const rows = await asUser(db, user, (tx) =>
      tx.query<{ id: string; salon_slug: string; can_change: boolean; services: string }>("select id, salon_slug, can_change, services from public.customer_bookings()"),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ id, salon_slug: "views", can_change: true, services: "Střih" });
    const salons = await asUser(db, user, (tx) => tx.query<{ slug: string }>("select slug from public.customer_salons()"));
    expect(salons.rows.map((r) => r.slug)).toEqual(["views"]);
  });

  it("cizí zákazník nic nevidí a anonym funkci volat nemůže", async () => {
    const stranger = await createUser(db, "cizi-prehled@example.cz");
    const rows = await asUser(db, stranger, (tx) => tx.query("select * from public.customer_bookings()"));
    expect(rows.rows).toHaveLength(0);
    await expect(asUser(db, null, (tx) => tx.query("select * from public.customer_bookings()"))).rejects.toThrow(/permission denied/);
  });
});

describe("přepočet konceptu faktury", () => {
  it("přepočítá součty konceptu a odmítne vystavený doklad", async () => {
    await db.query(
      "insert into public.salon_billing_profiles (salon_id, legal_name, ico, address_street, address_city, address_zip) values ($1, 'Salon s.r.o.', '87654321', 'A 1', 'Praha', '11000')",
      [s.salonId],
    );
    const draft = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ id: string }>(
        "select public.create_invoice($1, 'invoice', $2::jsonb, $3::jsonb) as id",
        [s.salonId, JSON.stringify({ name: "Firma" }), JSON.stringify([{ description: "Služba", quantity: 1, unit_price: 10000, vat_rate: 0 }])],
      ),
    );
    const id = draft.rows[0]!.id;
    await asUser(db, s.ownerId, (tx) => tx.query("insert into public.invoice_items (salon_id, invoice_id, description, unit_price) values ($1, $2, 'Další', 5000)", [s.salonId, id]));
    await asUser(db, s.ownerId, (tx) => tx.query("select public.recompute_invoice_draft($1)", [id]));
    const total = await db.query<{ total_gross: string }>("select total_gross from public.invoices where id = $1", [id]);
    expect(Number(total.rows[0]!.total_gross)).toBe(15000);
    await asUser(db, s.ownerId, (tx) => tx.query("select public.issue_invoice($1)", [id]));
    await expect(asUser(db, s.ownerId, (tx) => tx.query("select public.recompute_invoice_draft($1)", [id]))).rejects.toThrow(/invoice_immutable/);
  });
});
