import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./support/harness";

let db: Db;
let owner: string;
let salonId: string;
let locationId: string;
let staffId: string;

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "owner@example.cz");
  const salon = await db.query<{ id: string }>(
    "insert into public.salons (name, slug, plan_code) values ('Salon', 'salon-a', 'pro') returning id",
  );
  salonId = salon.rows[0]!.id;
  await db.query("insert into public.memberships (salon_id, user_id, role) values ($1, $2, 'owner')", [salonId, owner]);
  const location = await db.query<{ id: string }>(
    "insert into public.locations (salon_id, name, slug) values ($1, 'Praha', 'praha') returning id",
    [salonId],
  );
  locationId = location.rows[0]!.id;
  const staff = await db.query<{ id: string }>(
    "insert into public.staff (salon_id, display_name) values ($1, 'Barber A') returning id",
    [salonId],
  );
  staffId = staff.rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

describe("obsazenost pracovníka", () => {
  it("nedovolí překrývající se sloty", async () => {
    await db.query(
      "insert into public.staff_busy_slots (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-01 10:00+02', '2026-10-01 11:00+02', '[)'), 'booking')",
      [salonId, staffId],
    );
    await expect(
      db.query(
        "insert into public.staff_busy_slots (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-01 10:30+02', '2026-10-01 11:30+02', '[)'), 'booking')",
        [salonId, staffId],
      ),
    ).rejects.toThrow(/staff_busy_no_overlap/);
  });

  it("dovolí navazující sloty", async () => {
    await db.query(
      "insert into public.staff_busy_slots (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-01 11:00+02', '2026-10-01 12:00+02', '[)'), 'booking')",
      [salonId, staffId],
    );
  });

  it("dovolená se propíše do obsazenosti a koliduje s rezervací", async () => {
    await db.query(
      "insert into public.staff_time_off (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-05 00:00+02', '2026-10-09 00:00+02', '[)'), 'vacation')",
      [salonId, staffId],
    );
    await expect(
      db.query(
        "insert into public.staff_busy_slots (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-06 10:00+02', '2026-10-06 11:00+02', '[)'), 'booking')",
        [salonId, staffId],
      ),
    ).rejects.toThrow(/staff_busy_no_overlap/);
  });

  it("dovolená přes existující rezervaci vrátí čitelnou chybu", async () => {
    await expect(
      db.query(
        "insert into public.staff_time_off (salon_id, staff_id, during, kind) values ($1, $2, tstzrange('2026-10-01 00:00+02', '2026-10-02 00:00+02', '[)'), 'block')",
        [salonId, staffId],
      ),
    ).rejects.toThrow(/time_off_conflict/);
  });
});

describe("služby a limity", () => {
  it("nová služba se sváže se stávajícími pracovníky", async () => {
    const service = await db.query<{ id: string }>(
      "insert into public.services (salon_id, name, duration_min, price) values ($1, 'Střih', 30, 45000) returning id",
      [salonId],
    );
    const linked = await db.query("select 1 from public.staff_services where service_id = $1", [service.rows[0]!.id]);
    expect(linked.rows).toHaveLength(1);
  });

  it("tarif PRO omezí počet pracovníků na 5", async () => {
    for (let i = 0; i < 4; i++) {
      await db.query("insert into public.staff (salon_id, display_name) values ($1, $2)", [salonId, `Kolega ${i}`]);
    }
    await expect(
      db.query("insert into public.staff (salon_id, display_name) values ($1, 'Šestý')", [salonId]),
    ).rejects.toThrow(/plan_limit_staff/);
  });

  it("tarif PRO omezí počet poboček na 1", async () => {
    await expect(
      db.query("insert into public.locations (salon_id, name, slug) values ($1, 'Brno', 'brno')", [salonId]),
    ).rejects.toThrow(/plan_limit_locations/);
  });

  it("pouze správce může zakládat služby", async () => {
    const reception = await createUser(db, "reception@example.cz");
    await db.query("insert into public.memberships (salon_id, user_id, role) values ($1, $2, 'reception')", [salonId, reception]);
    await expect(
      asUser(db, reception, (tx) =>
        tx.query("insert into public.services (salon_id, name, duration_min) values ($1, 'X', 30)", [salonId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("pozvánky", () => {
  it("pozvaný uživatel se stane členem", async () => {
    const invitee = await createUser(db, "novy@example.cz");
    const token = await asUser(db, owner, (tx) =>
      tx.query<{ create_invite: string }>("select public.create_invite($1, 'novy@example.cz', 'reception')", [salonId]),
    );
    const salon = await asUser(db, invitee, (tx) =>
      tx.query<{ accept_invite: string }>("select public.accept_invite($1)", [token.rows[0]!.create_invite]),
    );
    expect(salon.rows[0]!.accept_invite).toBe(salonId);
  });

  it("pozvánka se nedá použít s cizím e-mailem", async () => {
    const stranger = await createUser(db, "cizi@example.cz");
    const token = await asUser(db, owner, (tx) =>
      tx.query<{ create_invite: string }>("select public.create_invite($1, 'jiny@example.cz', 'staff')", [salonId]),
    );
    await expect(
      asUser(db, stranger, (tx) => tx.query("select public.accept_invite($1)", [token.rows[0]!.create_invite])),
    ).rejects.toThrow(/invite_email_mismatch/);
  });
});
