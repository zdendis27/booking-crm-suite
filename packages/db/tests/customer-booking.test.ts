import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";
import { seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let auto: SeededSalon;
let manual: SeededSalon;
let strict: SeededSalon;

const items = (s: SeededSalon, ...services: string[]) =>
  JSON.stringify(services.map((service_id) => ({ service_id, staff_id: s.staffId })));

const at = (day: string, time: string) => `${day} ${time}+02`;

async function customer(email: string, phone?: string) {
  const userId = await createUser(db, email);
  if (phone) {
    await db.query(
      "update public.customer_accounts set phone = $2, phone_verified_at = now() where user_id = $1",
      [userId, phone],
    );
  }
  return userId;
}

function book(userId: string, s: SeededSalon, time: string, service = s.serviceId) {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "select public.customer_create_booking($1, $2::jsonb, $3::timestamptz, 'poznámka') as id",
      [s.locationId, items(s, service), at(s.monday, time)],
    );
    return r.rows[0]!.id;
  });
}

beforeAll(async () => {
  db = await createDb();
  auto = await seedSalon(db, "auto");
  manual = await seedSalon(db, "manual", { mode: "manual" });
  strict = await seedSalon(db, "strict", { policy: "email_phone" });
});

afterAll(async () => {
  await db.close();
});

describe("online rezervace zákazníka", () => {
  it("vytvoří potvrzenou rezervaci a klienta propojeného s účtem", async () => {
    const user = await customer("z1@example.cz");
    const id = await book(user, auto, "10:00");
    const booking = await db.query<{ status: string; source: string; client_note: string }>(
      "select status, source, client_note from public.bookings where id = $1",
      [id],
    );
    expect(booking.rows[0]).toMatchObject({ status: "confirmed", source: "online", client_note: "poznámka" });
    const clients = await db.query(
      "select 1 from public.clients c join public.customer_accounts a on a.id = c.customer_account_id where a.user_id = $1 and c.salon_id = $2",
      [user, auto.salonId],
    );
    expect(clients.rows).toHaveLength(1);
  });

  it("v ručním režimu vznikne čekající rezervace", async () => {
    const user = await customer("z2@example.cz");
    const id = await book(user, manual, "10:00");
    const row = await db.query<{ status: string }>("select status from public.bookings where id = $1", [id]);
    expect(row.rows[0]!.status).toBe("pending");
  });

  it("neověřený e-mail nestačí", async () => {
    const user = await customer("z3@example.cz");
    await db.query("update public.customer_accounts set email_verified_at = null where user_id = $1", [user]);
    await expect(book(user, auto, "11:00")).rejects.toThrow(/verification_required/);
  });

  it("salon s politikou e-mail+telefon vyžaduje ověřený telefon", async () => {
    const withoutPhone = await customer("z4@example.cz");
    await expect(book(withoutPhone, strict, "10:00")).rejects.toThrow(/verification_required/);
    const withPhone = await customer("z5@example.cz", "+420777123456");
    await expect(book(withPhone, strict, "10:00")).resolves.toBeTruthy();
  });

  it("obsazený nebo mimo pracovní dobu termín je odmítnut", async () => {
    const user = await customer("z6@example.cz");
    await expect(book(user, auto, "10:00")).rejects.toThrow(/slot_unavailable/);
    await expect(book(user, auto, "07:00")).rejects.toThrow(/slot_unavailable/);
  });

  it("propojí existujícího klienta podle ověřeného telefonu místo duplicity", async () => {
    const user = await customer("z7@example.cz", "+420777000001");
    await book(user, auto, "12:00");
    const clients = await db.query("select id from public.clients where salon_id = $1 and phone = '+420777000001'", [
      auto.salonId,
    ]);
    expect(clients.rows).toHaveLength(1);
    const linked = await db.query<{ customer_account_id: string | null }>(
      "select customer_account_id from public.clients where id = $1",
      [auto.clientId],
    );
    expect(linked.rows[0]!.customer_account_id).not.toBeNull();
  });

  it("nedostupnou službu (jen pro admina) nelze zarezervovat online", async () => {
    await db.query("update public.services set online_bookable = false where id = $1", [auto.shortServiceId]);
    const user = await customer("z8@example.cz");
    await expect(book(user, auto, "13:00", auto.shortServiceId)).rejects.toThrow(/service_not_bookable/);
  });
});

describe("správa rezervace zákazníkem", () => {
  it("zákazník vidí jen své rezervace", async () => {
    const owner = await customer("z9@example.cz");
    await book(owner, auto, "14:00");
    const other = await customer("z10@example.cz");
    const mine = await asUser(db, owner, (tx) => tx.query("select id from public.bookings"));
    const theirs = await asUser(db, other, (tx) => tx.query("select id from public.bookings"));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
  });

  it("před termínem storna může zrušit, nemůže si ale rezervaci potvrdit", async () => {
    const user = await customer("z11@example.cz");
    const id = await book(user, auto, "15:00");
    await expect(
      asUser(db, user, (tx) => tx.query("select public.set_booking_status($1, 'completed')", [id])),
    ).rejects.toThrow(/forbidden/);
    await asUser(db, user, (tx) => tx.query("select public.set_booking_status($1, 'cancelled_by_client', 'změna plánů')", [id]));
    const row = await db.query<{ status: string }>("select status from public.bookings where id = $1", [id]);
    expect(row.rows[0]!.status).toBe("cancelled_by_client");
  });

  it("po uplynutí storno lhůty už rezervaci zrušit nejde", async () => {
    const user = await customer("z12@example.cz");
    const id = await book(user, auto, "16:00");
    await db.query("update public.location_booking_settings set cancel_deadline_h = 24 * 60 where location_id = $1", [auto.locationId]);
    await expect(
      asUser(db, user, (tx) => tx.query("select public.set_booking_status($1, 'cancelled_by_client')", [id])),
    ).rejects.toThrow(/cancel_deadline_passed/);
    await db.query("update public.location_booking_settings set cancel_deadline_h = 24 where location_id = $1", [auto.locationId]);
  });

  it("přeplánování ověří dostupnost", async () => {
    const user = await customer("z13@example.cz");
    const id = await book(user, auto, "09:00");
    await asUser(db, user, (tx) =>
      tx.query("select public.customer_reschedule_booking($1, $2::timestamptz)", [id, at(auto.monday, "09:30")]),
    );
    await expect(
      asUser(db, user, (tx) =>
        tx.query("select public.customer_reschedule_booking($1, $2::timestamptz)", [id, at(auto.monday, "10:00")]),
      ),
    ).rejects.toThrow(/slot_unavailable/);
  });

  it("vypršelá čekající rezervace se automaticky zruší a uvolní termín", async () => {
    const user = await customer("z14@example.cz");
    const id = await book(user, manual, "11:00");
    await db.query("update public.bookings set expires_at = now() - interval '1 minute' where id = $1", [id]);
    const expired = await db.query<{ expire_pending_bookings: number }>("select public.expire_pending_bookings()");
    expect(expired.rows[0]!.expire_pending_bookings).toBe(1);
    const row = await db.query<{ status: string; cancel_reason: string }>(
      "select status, cancel_reason from public.bookings where id = $1",
      [id],
    );
    expect(row.rows[0]).toMatchObject({ status: "cancelled_by_salon", cancel_reason: "expired" });
  });
});
