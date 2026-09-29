import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, type Db } from "./support/harness";
import { seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;
let offset = 0;

const items = (...services: string[]) =>
  JSON.stringify(services.map((service_id) => ({ service_id, staff_id: s.staffId })));

async function nextDay(): Promise<string> {
  const date = new Date(`${s.monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7 * offset++);
  return date.toISOString().slice(0, 10);
}

async function completedVisit(clientId = s.clientId, service = s.serviceId, when?: string) {
  const day = when ?? (await nextDay());
  const id = await asUser(db, s.ownerId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
      [s.locationId, clientId, items(service), `${day} 10:00+02`],
    );
    return r.rows[0]!.id;
  });
  await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'completed')", [id]));
  return id;
}

async function stamps(clientId = s.clientId) {
  const r = await db.query<{ n: number }>(
    "select public.loyalty_stamp_count($1, (select id from public.loyalty_programs where salon_id = $2 and active)) as n",
    [clientId, s.salonId],
  );
  return r.rows[0]!.n;
}

async function rewards(clientId = s.clientId) {
  const r = await db.query<{ id: string; status: string }>(
    "select id, status from public.loyalty_rewards where client_id = $1 order by earned_at",
    [clientId],
  );
  return r.rows;
}

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "loyalty");
  await db.query(
    "insert into public.loyalty_programs (salon_id, threshold, reward_type, reward_service_id) values ($1, 3, 'free_service', $2)",
    [s.salonId, s.serviceId],
  );
});

afterAll(async () => {
  await db.close();
});

describe("věrnostní razítka", () => {
  it("přibývají za proběhlé návštěvy", async () => {
    await completedVisit();
    await completedVisit();
    expect(await stamps()).toBe(2);
    expect(await rewards()).toHaveLength(0);
  });

  it("po dosažení hranice vznikne odměna a razítka se spotřebují", async () => {
    await completedVisit();
    expect(await rewards()).toHaveLength(1);
    expect(await stamps()).toBe(0);
  });

  it("zrušená rezervace ani no-show razítko nedají", async () => {
    const day = await nextDay();
    const id = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, items(s.serviceId), `${day} 10:00+02`],
      );
      return r.rows[0]!.id;
    });
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'no_show')", [id]));
    expect(await stamps()).toBe(0);
  });

  it("uplatněná odměna slevuje službu a další návštěva razítko nezískává", async () => {
    const day = await nextDay();
    const bookingId = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, items(s.serviceId), `${day} 10:00+02`],
      );
      return r.rows[0]!.id;
    });
    const [reward] = await rewards();
    const discount = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ redeem_reward: string }>("select public.redeem_reward($1, $2)", [reward!.id, bookingId]),
    );
    expect(Number(discount.rows[0]!.redeem_reward)).toBe(45000);
    const booking = await db.query<{ discount_total: string }>("select discount_total from public.bookings where id = $1", [bookingId]);
    expect(Number(booking.rows[0]!.discount_total)).toBe(45000);
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'completed')", [bookingId]));
    expect(await stamps()).toBe(0);
    expect((await rewards())[0]!.status).toBe("redeemed");
  });

  it("odměnu nelze uplatnit dvakrát", async () => {
    const day = await nextDay();
    const bookingId = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, items(s.serviceId), `${day} 10:00+02`],
      );
      return r.rows[0]!.id;
    });
    const [reward] = await rewards();
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_reward($1, $2)", [reward!.id, bookingId])),
    ).rejects.toThrow(/reward_unavailable/);
  });

  it("zrušení rezervace s odměnou odměnu vrátí", async () => {
    const day = await nextDay();
    for (let i = 0; i < 3; i++) {
      await completedVisit();
    }
    const available = (await rewards()).find((r) => r.status === "available")!;
    const bookingId = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, items(s.serviceId), `${day} 11:00+02`],
      );
      return r.rows[0]!.id;
    });
    await asUser(db, s.ownerId, (tx) => tx.query("select public.redeem_reward($1, $2)", [available.id, bookingId]));
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'cancelled_by_salon')", [bookingId]));
    const after = (await rewards()).find((r) => r.id === available.id)!;
    expect(after.status).toBe("available");
    const adjustments = await db.query("select 1 from public.booking_adjustments where booking_id = $1", [bookingId]);
    expect(adjustments.rows).toHaveLength(0);
  });

  it("vrácení dokončené návštěvy odebere razítko", async () => {
    const other = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name) values ($1, 'Jan', 'Dvořák') returning id",
      [s.salonId],
    );
    const client = other.rows[0]!.id;
    const bookingId = await completedVisit(client);
    expect(await stamps(client)).toBe(1);
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'confirmed')", [bookingId]));
    expect(await stamps(client)).toBe(0);
  });

  it("ruční úprava razítek vyžaduje důvod a oprávnění", async () => {
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.adjust_loyalty_stamps($1, 1, '')", [s.clientId])),
    ).rejects.toThrow(/reason_required/);
    await expect(
      asUser(db, s.staffUserId, (tx) => tx.query("select public.adjust_loyalty_stamps($1, 1, 'dárek')", [s.clientId])),
    ).rejects.toThrow(/forbidden/);
    const before = await stamps();
    await asUser(db, s.ownerId, (tx) => tx.query("select public.adjust_loyalty_stamps($1, 2, 'dárek')", [s.clientId]));
    expect(await stamps()).toBe(before + 2);
  });
});

describe("statistiky klienta", () => {
  it("spočítá návštěvy, útratu a průměrný odstup od tří návštěv", async () => {
    const fresh = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name) values ($1, 'Eva', 'Malá') returning id",
      [s.salonId],
    );
    const client = fresh.rows[0]!.id;
    const base = new Date(`${s.monday}T00:00:00Z`);
    const days = [0, 21, 42].map((d) => {
      const date = new Date(base);
      date.setUTCDate(date.getUTCDate() + 300 + d);
      return date.toISOString().slice(0, 10);
    });
    await db.query("update public.salons set plan_code = 'business' where id = $1", [s.salonId]);
    await db.query("update public.location_booking_settings set max_advance_days = 730 where location_id = $1", [s.locationId]);
    for (const day of days) {
      const monday = new Date(`${day}T00:00:00Z`);
      while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
      await completedVisit(client, s.serviceId, monday.toISOString().slice(0, 10));
    }
    const stats = await db.query<{ visits_count: number; total_spent: string; avg_interval_days: string | null; next_expected_at: string | null }>(
      "select visits_count, total_spent, avg_interval_days, next_expected_at from public.client_stats where client_id = $1",
      [client],
    );
    expect(stats.rows[0]!.visits_count).toBe(3);
    expect(Number(stats.rows[0]!.total_spent)).toBe(135000);
    expect(Number(stats.rows[0]!.avg_interval_days)).toBeGreaterThan(0);
    expect(stats.rows[0]!.next_expected_at).not.toBeNull();
  });

  it("před třetí návštěvou se pravidelnost nepočítá", async () => {
    const fresh = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name) values ($1, 'Nový', 'Klient') returning id",
      [s.salonId],
    );
    await completedVisit(fresh.rows[0]!.id);
    const stats = await db.query<{ avg_interval_days: string | null }>(
      "select avg_interval_days from public.client_stats where client_id = $1",
      [fresh.rows[0]!.id],
    );
    expect(stats.rows[0]!.avg_interval_days).toBeNull();
  });
});

describe("slučování klientů", () => {
  it("přesune rezervace a označí duplicitu", async () => {
    const keep = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name, phone) values ($1, 'Karel', 'A', '+420601000001') returning id",
      [s.salonId],
    );
    const dup = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name, email) values ($1, 'Karel', 'A', 'karel@example.cz') returning id",
      [s.salonId],
    );
    const bookingId = await completedVisit(dup.rows[0]!.id);
    await asUser(db, s.ownerId, (tx) => tx.query("select public.merge_clients($1, $2)", [keep.rows[0]!.id, dup.rows[0]!.id]));
    const moved = await db.query<{ client_id: string }>("select client_id from public.bookings where id = $1", [bookingId]);
    expect(moved.rows[0]!.client_id).toBe(keep.rows[0]!.id);
    const merged = await db.query<{ merged_into: string }>("select merged_into from public.clients where id = $1", [dup.rows[0]!.id]);
    expect(merged.rows[0]!.merged_into).toBe(keep.rows[0]!.id);
    const kept = await db.query<{ email: string }>("select email::text as email from public.clients where id = $1", [keep.rows[0]!.id]);
    expect(kept.rows[0]!.email).toBe("karel@example.cz");
  });
});
