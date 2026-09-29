import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";
import { seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;
let free: SeededSalon;

const join = (userId: string, salon: SeededSalon) =>
  asUser(db, userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "select public.customer_join_waitlist($1, $2::uuid[], $3, current_date + 1, current_date + 5, '09:00', '12:00') as id",
      [salon.locationId, [salon.serviceId], salon.staffId],
    );
    return r.rows[0]!.id;
  });

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "cekarna");
  free = await seedSalon(db, "zdarma", { plan: "free" });
});

afterAll(async () => {
  await db.close();
});

describe("čekací listina zákazníka", () => {
  it("zapíše zákazníka, vypíše záznam a umožní zrušení", async () => {
    const user = await createUser(db, "cekatel@example.cz");
    const id = await join(user, s);
    const list = await asUser(db, user, (tx) => tx.query<{ id: string; status: string }>("select id, status from public.customer_waitlist()"));
    expect(list.rows).toEqual([{ id, status: "waiting" }]);
    await asUser(db, user, (tx) => tx.query("select public.customer_cancel_waitlist($1)", [id]));
    const after = await asUser(db, user, (tx) => tx.query("select id from public.customer_waitlist()"));
    expect(after.rows).toHaveLength(0);
  });

  it("cizí záznam nejde zrušit", async () => {
    const owner = await createUser(db, "vlastnik-zaznamu@example.cz");
    const stranger = await createUser(db, "cizi@example.cz");
    const id = await join(owner, s);
    await asUser(db, stranger, (tx) => tx.query("select public.customer_cancel_waitlist($1)", [id]));
    const row = await db.query<{ status: string }>("select status from public.waitlist_entries where id = $1", [id]);
    expect(row.rows[0]!.status).toBe("waiting");
  });

  it("tarif bez čekací listiny ji odmítne", async () => {
    const user = await createUser(db, "free-user@example.cz");
    await expect(join(user, free)).rejects.toThrow(/feature_unavailable/);
  });

  it("odhlášení z marketingu zruší všechny souhlasy klienta", async () => {
    const user = await createUser(db, "marketing@example.cz");
    await join(user, s);
    const client = await db.query<{ id: string }>(
      "select c.id from public.clients c join public.customer_accounts a on a.id = c.customer_account_id where a.user_id = $1 and c.salon_id = $2",
      [user, s.salonId],
    );
    const clientId = client.rows[0]!.id;
    await db.query("insert into public.client_consents (salon_id, client_id, type) values ($1, $2, 'marketing_email')", [s.salonId, clientId]);
    await db.query("select public.unsubscribe_client_marketing($1)", [clientId]);
    const active = await db.query("select 1 from public.client_consents where client_id = $1 and revoked_at is null", [clientId]);
    expect(active.rows).toHaveLength(0);
  });
});
