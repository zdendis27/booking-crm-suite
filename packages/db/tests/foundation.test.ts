import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";

let db: Db;
let owner: string;
let outsider: string;
let salonId: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.cz");
  outsider = await createUser(db, "outsider@example.cz");
  const salon = await db.query<{ id: string }>(
    "insert into public.salons (name, slug) values ('Barber Test', 'barber-test') returning id",
  );
  salonId = salon.rows[0]!.id;
  await db.query("insert into public.memberships (salon_id, user_id, role) values ($1, $2, 'owner')", [salonId, owner]);
});

afterAll(async () => {
  await db.close();
});

describe("izolace salonů", () => {
  it("člen vidí svůj salon", async () => {
    const rows = await asUser(db, owner, (tx) => tx.query("select id from public.salons"));
    expect(rows.rows).toHaveLength(1);
  });

  it("cizí uživatel nevidí nic", async () => {
    const rows = await asUser(db, outsider, (tx) => tx.query("select id from public.salons"));
    expect(rows.rows).toHaveLength(0);
  });

  it("anonym nevidí salon", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select id from public.salons"))).resolves.toMatchObject({
      rows: [],
    });
  });

  it("cizí uživatel nemůže měnit cizí salon", async () => {
    const result = await asUser(db, outsider, (tx) =>
      tx.query("update public.salons set name = 'Hacked' where id = $1 returning id", [salonId]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("majitel nesmí měnit tarif přímo", async () => {
    await expect(
      asUser(db, owner, (tx) => tx.query("update public.salons set plan_code = 'multi' where id = $1", [salonId])),
    ).rejects.toThrow(/forbidden_column_change/);
  });

  it("nelze odebrat posledního majitele", async () => {
    await expect(
      asUser(db, owner, (tx) =>
        tx.query("delete from public.memberships where salon_id = $1 and user_id = $2", [salonId, owner]),
      ),
    ).rejects.toThrow(/last_owner/);
  });
});

describe("tarify", () => {
  it("jsou veřejně čitelné", async () => {
    const rows = await asUser(db, null, (tx) => tx.query("select code from public.plans order by sort"));
    expect(rows.rows.map((r) => (r as { code: string }).code)).toEqual(["free", "solo", "pro", "business", "multi"]);
  });
});
