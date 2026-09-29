import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";
import { pragueTs, seedSalon, type SeededSalon } from "./support/fixtures";

let db: Db;
let s: SeededSalon;

const items = (...pairs: [string, string][]) =>
  JSON.stringify(pairs.map(([service_id, staff_id]) => ({ service_id, staff_id })));

const at = pragueTs;

async function slots(serviceIds: string[], day: string, staff: string | null = null) {
  const result = await db.query<{ local: string }>(
    `select to_char(slot_start at time zone 'Europe/Prague', 'HH24:MI') as local
     from public.get_availability($1, $2::uuid[], $3::date, $3::date, $4) order by slot_start`,
    [s.locationId, `{${serviceIds.join(",")}}`, day, staff],
  );
  return result.rows.map((r) => r.local);
}

async function adminBooking(day: string, time: string, service = s.serviceId) {
  return asUser(db, s.ownerId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
      [s.locationId, s.clientId, items([service, s.staffId]), at(day, time)],
    );
    return r.rows[0]!.id;
  });
}

beforeAll(async () => {
  db = await createDb();
  s = await seedSalon(db, "bookings");
});

afterAll(async () => {
  await db.close();
});

describe("dostupnost", () => {
  it("vygeneruje sloty po 15 minutách v pracovní době v pražském čase", async () => {
    const result = await slots([s.serviceId], s.monday);
    expect(result[0]).toBe("09:00");
    expect(result.at(-1)).toBe("16:30");
    expect(result).toHaveLength(31);
  });

  it("o víkendu nejsou žádné sloty", async () => {
    const date = new Date(`${s.monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 5);
    expect(await slots([s.serviceId], date.toISOString().slice(0, 10))).toHaveLength(0);
  });

  it("více služeb prodlouží blok včetně pauzy mezi nimi", async () => {
    const result = await slots([s.serviceId, s.shortServiceId], s.monday);
    expect(result.at(-1)).toBe("16:15");
  });

  it("pracovník bez dané služby není nabídnut", async () => {
    await db.query("delete from public.staff_services where staff_id = $1 and service_id = $2", [s.staffId, s.shortServiceId]);
    expect(await slots([s.shortServiceId], s.monday)).toHaveLength(0);
    await db.query("insert into public.staff_services (staff_id, service_id, salon_id) values ($1, $2, $3)", [
      s.staffId,
      s.shortServiceId,
      s.salonId,
    ]);
  });
});

describe("vytvoření rezervace", () => {
  it("uloží položky, cenu a obsazenost", async () => {
    const id = await adminBooking(s.monday, "10:00");
    const booking = await db.query<{ price_total: string; primary_staff_id: string; status: string }>(
      "select price_total, primary_staff_id, status from public.bookings where id = $1",
      [id],
    );
    expect(Number(booking.rows[0]!.price_total)).toBe(45000);
    expect(booking.rows[0]!.primary_staff_id).toBe(s.staffId);
    expect(booking.rows[0]!.status).toBe("confirmed");
    const busy = await db.query("select 1 from public.staff_busy_slots where staff_id = $1", [s.staffId]);
    expect(busy.rows.length).toBeGreaterThan(0);
  });

  it("obsazený termín zmizí z dostupnosti, navazující zůstane", async () => {
    const result = await slots([s.serviceId], s.monday);
    expect(result).not.toContain("10:00");
    expect(result).not.toContain("09:45");
    expect(result).toContain("09:30");
    expect(result).toContain("10:30");
  });

  it("druhá rezervace na stejný čas selže", async () => {
    await expect(adminBooking(s.monday, "10:15")).rejects.toThrow(/slot_taken/);
  });

  it("rezervace s více službami spočítá čas a cenu", async () => {
    const id = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, items([s.serviceId, s.staffId], [s.shortServiceId, s.staffId]), at(s.monday, "13:00")],
      );
      return r.rows[0]!.id;
    });
    const row = await db.query<{ price_total: string; span: string }>(
      "select price_total, to_char(ends_at at time zone 'Europe/Prague', 'HH24:MI') as span from public.bookings where id = $1",
      [id],
    );
    expect(Number(row.rows[0]!.price_total)).toBe(65000);
    expect(row.rows[0]!.span).toBe("13:45");
  });

  it("neúspěšná rezervace nezanechá žádná osiřelá data", async () => {
    const before = await db.query<{ n: string }>("select count(*) as n from public.bookings");
    await expect(adminBooking(s.monday, "10:00")).rejects.toThrow();
    const after = await db.query<{ n: string }>("select count(*) as n from public.bookings");
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it("cizí pracovník nebo služba je odmítnuta", async () => {
    const other = await seedSalon(db, "other-salon");
    await expect(
      asUser(db, s.ownerId, (tx) =>
        tx.query("select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz)", [
          s.locationId,
          s.clientId,
          items([other.serviceId, other.staffId]),
          at(s.monday, "15:00"),
        ]),
      ),
    ).rejects.toThrow(/service_not_found/);
  });
});

describe("stavy rezervace", () => {
  it("zrušení uvolní termín a obnovení ho zase obsadí", async () => {
    const id = await adminBooking(s.monday, "14:00");
    await asUser(db, s.ownerId, (tx) =>
      tx.query("select public.set_booking_status($1, 'cancelled_by_salon', 'test')", [id]),
    );
    expect(await slots([s.serviceId], s.monday)).toContain("14:00");
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'confirmed')", [id]));
    expect(await slots([s.serviceId], s.monday)).not.toContain("14:00");
  });

  it("obnovení zrušené rezervace selže, když je termín mezitím obsazený", async () => {
    const id = await adminBooking(s.monday, "15:00");
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'cancelled_by_salon')", [id]));
    await adminBooking(s.monday, "15:00");
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'confirmed')", [id])),
    ).rejects.toThrow(/slot_taken/);
  });

  it("neplatný přechod je odmítnut", async () => {
    const id = await adminBooking(s.monday, "16:00");
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'pending')", [id])),
    ).rejects.toThrow(/invalid_transition/);
  });

  it("přesun změní obsazenost a kolizi vrátí zpět bez změny", async () => {
    const id = await adminBooking(s.monday, "11:30");
    await asUser(db, s.ownerId, (tx) =>
      tx.query("select public.move_booking($1, $2::timestamptz)", [id, at(s.monday, "12:00")]),
    );
    const moved = await slots([s.serviceId], s.monday);
    expect(moved).toContain("11:30");
    expect(moved).not.toContain("12:00");
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.move_booking($1, $2::timestamptz)", [id, at(s.monday, "10:00")])),
    ).rejects.toThrow(/slot_taken/);
    const still = await db.query<{ local: string }>(
      "select to_char(starts_at at time zone 'Europe/Prague', 'HH24:MI') as local from public.bookings where id = $1",
      [id],
    );
    expect(still.rows[0]!.local).toBe("12:00");
  });

  it("rezervace v minulosti se nepočítá do dostupnosti, ale dokončená drží čas", async () => {
    const id = await adminBooking(s.monday, "09:00");
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'completed')", [id]));
    expect(await slots([s.serviceId], s.monday)).not.toContain("09:00");
  });
});

describe("dovolená a výjimky", () => {
  it("dovolená odstraní sloty", async () => {
    const date = new Date(`${s.monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    const tuesday = date.toISOString().slice(0, 10);
    expect((await slots([s.serviceId], tuesday)).length).toBeGreaterThan(0);
    await db.query(
      "insert into public.staff_time_off (salon_id, staff_id, during, kind) values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'vacation')",
      [s.salonId, s.staffId, at(tuesday, "00:00"), at(tuesday, "23:59")],
    );
    expect(await slots([s.serviceId], tuesday)).toHaveLength(0);
  });

  it("výjimka kind=off zruší den, extra přidá hodiny", async () => {
    const date = new Date(`${s.monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    const wednesday = date.toISOString().slice(0, 10);
    await db.query(
      "insert into public.staff_schedule_overrides (salon_id, staff_id, location_id, day, kind) values ($1, $2, $3, $4, 'off')",
      [s.salonId, s.staffId, s.locationId, wednesday],
    );
    expect(await slots([s.serviceId], wednesday)).toHaveLength(0);
    await db.query(
      "insert into public.staff_schedule_overrides (salon_id, staff_id, location_id, day, kind, starts, ends) values ($1, $2, $3, $4, 'extra', '18:00', '19:00')",
      [s.salonId, s.staffId, s.locationId, wednesday],
    );
    expect(await slots([s.serviceId], wednesday)).toEqual(["18:00", "18:15", "18:30"]);
  });
});

describe("oprávnění", () => {
  it("pracovník (role staff) vidí jen své rezervace", async () => {
    const otherStaff = await db.query<{ id: string }>(
      "insert into public.staff (salon_id, display_name) values ($1, 'Barber B') returning id",
      [s.salonId],
    );
    await db.query("insert into public.staff_locations (staff_id, location_id, salon_id) values ($1, $2, $3)", [
      otherStaff.rows[0]!.id,
      s.locationId,
      s.salonId,
    ]);
    await asUser(db, s.ownerId, (tx) =>
      tx.query("select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz)", [
        s.locationId,
        s.clientId,
        items([s.serviceId, otherStaff.rows[0]!.id]),
        at(s.monday, "10:00"),
      ]),
    );
    const own = await asUser(db, s.staffUserId, (tx) => tx.query("select id, primary_staff_id from public.bookings"));
    expect(own.rows.length).toBeGreaterThan(0);
    for (const row of own.rows as { primary_staff_id: string }[]) {
      expect(row.primary_staff_id).toBe(s.staffId);
    }
  });

  it("cizí salon nevidí rezervace", async () => {
    const stranger = await createUser(db, "stranger@example.cz");
    const rows = await asUser(db, stranger, (tx) => tx.query("select id from public.bookings"));
    expect(rows.rows).toHaveLength(0);
  });

  it("nikdo nemůže zapisovat do rezervací přímo", async () => {
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("update public.bookings set price_total = 1 where salon_id = $1", [s.salonId])),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });
});
