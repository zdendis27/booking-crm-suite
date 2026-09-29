import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createUser, type Db } from "./support/harness";
import { pragueTs, seedSalon, upcomingMonday, type SeededSalon } from "./support/fixtures";

let db: Db;

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

describe("založení salonu", () => {
  it("vytvoří salon, pobočku, hodiny, pracovníka a služby ze šablony", async () => {
    const user = await createUser(db, "novy-majitel@example.cz");
    const result = await asUser(db, user, (tx) =>
      tx.query<{ r: { salon_id: string; location_id: string; staff_id: string } }>(
        "select public.create_salon('Barber Praha', 'barber-praha', 'Smíchov', 'barber') as r",
      ),
    );
    const { salon_id, location_id, staff_id } = result.rows[0]!.r;
    const services = await db.query("select 1 from public.services where salon_id = $1", [salon_id]);
    expect(services.rows).toHaveLength(3);
    const linked = await db.query("select 1 from public.staff_services where staff_id = $1", [staff_id]);
    expect(linked.rows).toHaveLength(3);
    const hours = await db.query("select 1 from public.location_hours where location_id = $1", [location_id]);
    expect(hours.rows).toHaveLength(5);
    const role = await db.query<{ role: string }>("select role from public.memberships where salon_id = $1 and user_id = $2", [salon_id, user]);
    expect(role.rows[0]!.role).toBe("owner");
  });

  it("nový salon je hned rezervovatelný", async () => {
    const user = await createUser(db, "rezervovatelny@example.cz");
    const created = await asUser(db, user, (tx) =>
      tx.query<{ r: { location_id: string } }>("select public.create_salon('Ready', 'ready-salon', 'Hlavní', 'hair') as r"),
    );
    const { location_id } = created.rows[0]!.r;
    const service = await db.query<{ id: string }>("select id from public.services where name = 'Pánský střih' and salon_id = (select salon_id from public.locations where id = $1)", [location_id]);
    const slots = await db.query(
      "select 1 from public.get_availability($1, $2::uuid[], $3::date, $3::date)",
      [location_id, `{${service.rows[0]!.id}}`, upcomingMonday()],
    );
    expect(slots.rows.length).toBeGreaterThan(20);
  });

  it("odmítne obsazený, rezervovaný a neplatný slug", async () => {
    const user = await createUser(db, "slugy@example.cz");
    await expect(asUser(db, user, (tx) => tx.query("select public.create_salon('X', 'barber-praha')"))).rejects.toThrow(/slug_taken/);
    await expect(asUser(db, user, (tx) => tx.query("select public.create_salon('X', 'admin')"))).rejects.toThrow(/slug_reserved/);
    await expect(asUser(db, user, (tx) => tx.query("select public.create_salon('X', 'A B')"))).rejects.toThrow(/invalid_slug/);
    const free = await asUser(db, null, (tx) => tx.query<{ a: boolean }>("select public.slug_available('volny-slug') as a"));
    expect(free.rows[0]!.a).toBe(true);
  });

  it("nepřihlášený salon založit nemůže", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select public.create_salon('X', 'anonym-salon')"))).rejects.toThrow(/permission denied/);
  });
});

describe("veřejná stránka salonu", () => {
  it("vrací jen veřejné údaje, služby, tým a hodiny", async () => {
    const page = await asUser(db, null, (tx) => tx.query<{ p: Record<string, unknown> }>("select public.public_salon('barber-praha') as p"));
    const salon = page.rows[0]!.p as {
      name: string;
      services: unknown[];
      staff: { services: Record<string, unknown> }[];
      locations: { hours: unknown[] }[];
      verification_policy: string;
    };
    expect(salon.name).toBe("Barber Praha");
    expect(salon.services).toHaveLength(3);
    expect(salon.staff).toHaveLength(1);
    expect(Object.keys(salon.staff[0]!.services)).toHaveLength(3);
    expect(salon.locations[0]!.hours).toHaveLength(5);
    expect(JSON.stringify(salon)).not.toMatch(/created_by|stripe|iban/i);
  });

  it("neexistující salon vrací prázdnou hodnotu", async () => {
    const page = await asUser(db, null, (tx) => tx.query<{ p: unknown }>("select public.public_salon('neexistuje') as p"));
    expect(page.rows[0]!.p).toBeNull();
  });
});

describe("analytika", () => {
  let s: SeededSalon;

  beforeAll(async () => {
    s = await seedSalon(db, "analytics");
  });

  async function completedBooking(offsetDays: number, time = "10:00", service = s.serviceId) {
    const date = new Date(`${s.monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    const id = await asUser(db, s.ownerId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz) as id",
        [s.locationId, s.clientId, JSON.stringify([{ service_id: service, staff_id: s.staffId }]), pragueTs(date.toISOString().slice(0, 10), time)],
      );
      return r.rows[0]!.id;
    });
    await asUser(db, s.ownerId, (tx) => tx.query("select public.set_booking_status($1, 'completed')", [id]));
    await asUser(db, s.ownerId, (tx) => tx.query("select public.record_payment($1, 45000, 'card')", [id]));
    return { id, day: date.toISOString().slice(0, 10) };
  }

  it("spočítá tržby podle způsobu platby, výdaje a obsazenost", async () => {
    const first = await completedBooking(0);
    await completedBooking(0, "11:00");
    await db.query("insert into public.expenses (salon_id, category, description, amount, incurred_on) values ($1, 'najem', 'Nájem', 20000, $2)", [s.salonId, first.day]);
    const snap = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ r: any }>("select public.owner_snapshot($1, $2::date, $2::date) as r", [s.salonId, first.day]),
    );
    const r = snap.rows[0]!.r;
    expect(r.bookings.completed).toBe(2);
    expect(r.revenue.earned).toBe(90000);
    expect(r.expenses.total).toBe(20000);
    const cash = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ r: any }>(
        "select public.owner_snapshot($1, (now() at time zone 'Europe/Prague')::date - 1, (now() at time zone 'Europe/Prague')::date + 1) as r",
        [s.salonId],
      ),
    );
    expect(cash.rows[0]!.r.revenue.received).toBe(90000);
    expect(cash.rows[0]!.r.revenue.by_method.card).toBe(90000);
    expect(r.average_spend).toBe(45000);
    expect(r.occupancy.booked_min).toBe(60);
    expect(r.occupancy.scheduled_min).toBe(480);
    expect(r.occupancy.ratio).toBeCloseTo(0.125, 3);
    expect(r.by_service[0].name).toBe("Střih");
    expect(r.by_staff[0].revenue).toBe(90000);
    expect(r.clients.active).toBe(1);
  });

  it("dovolená sníží plánovanou dobu", async () => {
    const day = upcomingMonday(21);
    await db.query(
      "insert into public.staff_time_off (salon_id, staff_id, during, kind) values ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 'block')",
      [s.salonId, s.staffId, pragueTs(day, "09:00"), pragueTs(day, "13:00")],
    );
    const snap = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ r: any }>("select public.owner_snapshot($1, $2::date, $2::date) as r", [s.salonId, day]),
    );
    expect(snap.rows[0]!.r.occupancy.scheduled_min).toBe(240);
  });

  it("recepce vidí jen dnešek a bez výdajů, cizí salon nic", async () => {
    const reception = await createUser(db, "recepce-analytics@example.cz");
    await db.query("insert into public.memberships (salon_id, user_id, role) values ($1, $2, 'reception')", [s.salonId, reception]);
    const today = new Date().toISOString().slice(0, 10);
    const snap = await asUser(db, reception, (tx) =>
      tx.query<{ r: any }>("select public.owner_snapshot($1, $2::date, $2::date) as r", [s.salonId, today]),
    );
    expect(snap.rows[0]!.r.expenses).toBeNull();
    expect(snap.rows[0]!.r.by_staff).toBeNull();
    await expect(
      asUser(db, reception, (tx) => tx.query("select public.owner_snapshot($1, '2026-01-01', '2026-02-01')", [s.salonId])),
    ).rejects.toThrow(/forbidden/);
    const stranger = await createUser(db, "cizinec-analytics@example.cz");
    await expect(
      asUser(db, stranger, (tx) => tx.query("select public.owner_snapshot($1, $2::date, $2::date)", [s.salonId, today])),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("notifikace a automatizace", () => {
  let s: SeededSalon;
  let customerUser: string;

  const book = (userId: string, time: string, service?: string) =>
    asUser(db, userId, async (tx) => {
      const r = await tx.query<{ id: string }>(
        "select public.customer_create_booking($1, $2::jsonb, $3::timestamptz) as id",
        [s.locationId, JSON.stringify([{ service_id: service ?? s.serviceId, staff_id: s.staffId }]), pragueTs(s.monday, time)],
      );
      return r.rows[0]!.id;
    });

  beforeAll(async () => {
    s = await seedSalon(db, "notify");
    customerUser = await createUser(db, "zakaznik-notify@example.cz");
  });

  it("potvrzená online rezervace vytvoří e-mail klientovi a upozornění personálu", async () => {
    const id = await book(customerUser, "10:00");
    const rows = await db.query<{ type: string; channel: string; recipient: string | null }>(
      "select type, channel, recipient from public.notifications where booking_id = $1 order by type, channel",
      [id],
    );
    const types = rows.rows.map((r) => `${r.type}:${r.channel}`);
    expect(types).toContain("booking_confirmation:email");
    expect(types).toContain("booking_reminder:email");
    expect(types.some((t) => t.startsWith("staff_new_booking:in_app"))).toBe(true);
    const reminder = await db.query<{ scheduled_for: string; starts_at: string }>(
      "select n.scheduled_for, b.starts_at from public.notifications n join public.bookings b on b.id = n.booking_id where n.booking_id = $1 and n.type = 'booking_reminder'",
      [id],
    );
    const diff = new Date(reminder.rows[0]!.starts_at).getTime() - new Date(reminder.rows[0]!.scheduled_for).getTime();
    expect(diff).toBe(24 * 3600 * 1000);
  });

  it("zrušení odstraní naplánovanou připomínku a odešle oznámení o zrušení", async () => {
    const id = await book(customerUser, "11:00");
    await asUser(db, customerUser, (tx) => tx.query("select public.set_booking_status($1, 'cancelled_by_client')", [id]));
    const rows = await db.query<{ type: string; status: string }>("select type, status from public.notifications where booking_id = $1", [id]);
    expect(rows.rows.find((r) => r.type === "booking_reminder")!.status).toBe("cancelled");
    expect(rows.rows.some((r) => r.type === "booking_cancellation")).toBe(true);
  });

  it("vypnutá automatizace nic nevytvoří", async () => {
    await db.query("insert into public.automations (salon_id, type, enabled) values ($1, 'booking_reminder', false)", [s.salonId]);
    const id = await book(customerUser, "12:00");
    const rows = await db.query("select 1 from public.notifications where booking_id = $1 and type = 'booking_reminder'", [id]);
    expect(rows.rows).toHaveLength(0);
  });

  it("SMS se posílá jen při tarifu se SMS a zůstatku kreditů", async () => {
    const before = await db.query("select 1 from public.notifications where channel = 'sms'");
    expect(before.rows).toHaveLength(0);
    await db.query("update public.salons set plan_code = 'pro' where id = $1", [s.salonId]);
    await db.query("update public.automations set enabled = true, channels = '{email,sms}' where salon_id = $1 and type = 'booking_reminder'", [s.salonId]);
    await db.query("update public.clients set phone = '+420777888999' where customer_account_id = (select id from public.customer_accounts where user_id = $1)", [customerUser]);
    await db.query("select public.grant_sms_credits($1, 5, 'test')", [s.salonId]);
    const id = await book(customerUser, "13:00");
    const sms = await db.query("select 1 from public.notifications where booking_id = $1 and channel = 'sms'", [id]);
    expect(sms.rows.length).toBeGreaterThan(0);
  });

  it("worker si vyzvedne úkoly, odešle je a chyba se opakuje s odstupem", async () => {
    const claimed = await asService(db, (tx) => tx.query<{ id: string; channel: string }>("select id, channel from public.claim_notifications(50)"));
    expect(claimed.rows.length).toBeGreaterThan(0);
    const [first, second] = claimed.rows;
    await asService(db, (tx) => tx.query("select public.complete_notification($1, 'prov-1')", [first!.id]));
    const sent = await db.query<{ status: string }>("select status from public.notifications where id = $1", [first!.id]);
    expect(sent.rows[0]!.status).toBe("sent");
    if (second) {
      await asService(db, (tx) => tx.query("select public.fail_notification($1, 'timeout')", [second.id]));
      const retry = await db.query<{ status: string; attempts: number }>("select status, attempts from public.notifications where id = $1", [second.id]);
      expect(retry.rows[0]!.status).toBe("queued");
      expect(retry.rows[0]!.attempts).toBe(1);
    }
  });

  it("odeslaná SMS odečte kredit", async () => {
    await db.query("update public.notifications set scheduled_for = now() where channel = 'sms' and status = 'queued'");
    const claimed = await asService(db, (tx) => tx.query<{ id: string; channel: string }>("select id, channel from public.claim_notifications(50)"));
    const sms = claimed.rows.find((r) => r.channel === "sms");
    expect(sms).toBeDefined();
    const before = await db.query<{ b: number }>("select public.salon_sms_balance($1) as b", [s.salonId]);
    await asService(db, (tx) => tx.query("select public.complete_notification($1)", [sms!.id]));
    const after = await db.query<{ b: number }>("select public.salon_sms_balance($1) as b", [s.salonId]);
    expect(after.rows[0]!.b).toBe(before.rows[0]!.b - 1);
  });
});

describe("připomínka vrácení klienta", () => {
  it("pošle první a druhou připomínku maximálně jednou na cyklus a respektuje odhlášení", async () => {
    const s = await seedSalon(db, "return-reminder");
    const client = await db.query<{ id: string }>(
      "insert into public.clients (salon_id, first_name, last_name, email) values ($1, 'Petra', 'Řasová', 'petra@example.cz') returning id",
      [s.salonId],
    );
    const clientId = client.rows[0]!.id;
    await db.query(
      `insert into public.client_stats (client_id, salon_id, visits_count, last_visit_at, avg_interval_days, next_expected_at)
       values ($1, $2, 5, now() - interval '40 days', 25, now() - interval '15 days')`,
      [clientId, s.salonId],
    );
    await db.query(
      "update public.client_stats set last_visit_at = now() - interval '60 days', next_expected_at = now() - interval '35 days' where client_id = $1",
      [clientId],
    );
    const run = async () => (await db.query<{ n: number }>("select public.enqueue_return_reminders() as n")).rows[0]!.n;
    expect(await run()).toBe(1);
    const stages = async () =>
      (
        await db.query<{ payload: { stage: string; first_name: string } }>(
          "select payload from public.notifications where client_id = $1 and type = 'return_reminder' order by created_at",
          [clientId],
        )
      ).rows.map((r) => r.payload);
    expect((await stages()).map((p) => p.stage)).toEqual(["return1"]);
    expect((await stages())[0]!.first_name).toBe("Petra");
    expect(await run()).toBe(1);
    expect((await stages()).map((p) => p.stage)).toEqual(["return1", "return2"]);
    expect(await run()).toBe(0);
  });

  it("klient s budoucí rezervací nebo odhlášením e-mail nedostane", async () => {
    const s = await seedSalon(db, "return-reminder-2");
    const make = async (email: string) => {
      const r = await db.query<{ id: string }>(
        "insert into public.clients (salon_id, first_name, last_name, email) values ($1, 'X', 'Y', $2) returning id",
        [s.salonId, email],
      );
      await db.query(
        `insert into public.client_stats (client_id, salon_id, visits_count, last_visit_at, avg_interval_days, next_expected_at)
         values ($1, $2, 5, now() - interval '40 days', 25, now() - interval '15 days')`,
        [r.rows[0]!.id, s.salonId],
      );
      return r.rows[0]!.id;
    };
    const unsubscribed = await make("odhlaseny@example.cz");
    await asService(db, (tx) => tx.query("select public.unsubscribe_client($1, 'marketing_email')", [unsubscribed]));
    const booked = await make("objednany@example.cz");
    const day = upcomingMonday();
    await asUser(db, s.ownerId, (tx) =>
      tx.query("select public.admin_create_booking($1, $2, $3::jsonb, $4::timestamptz)", [
        s.locationId,
        booked,
        JSON.stringify([{ service_id: s.serviceId, staff_id: s.staffId }]),
        pragueTs(day, "10:00"),
      ]),
    );
    const before = await db.query<{ n: string }>("select count(*) as n from public.notifications where type = 'return_reminder' and salon_id = $1", [s.salonId]);
    await db.query("select public.enqueue_return_reminders()");
    const after = await db.query<{ n: string }>("select count(*) as n from public.notifications where type = 'return_reminder' and salon_id = $1", [s.salonId]);
    expect(Number(after.rows[0]!.n) - Number(before.rows[0]!.n)).toBe(0);
  });
});

describe("kampaně", () => {
  it("osloví jen klienty ze segmentu a respektuje tarif", async () => {
    const s = await seedSalon(db, "campaign");
    for (const [email, days] of [["a@example.cz", 90], ["b@example.cz", 10]] as const) {
      const c = await db.query<{ id: string }>(
        "insert into public.clients (salon_id, first_name, last_name, email) values ($1, 'K', $2::text, $2::text) returning id",
        [s.salonId, email],
      );
      await db.query(
        "insert into public.client_stats (client_id, salon_id, visits_count, last_visit_at) values ($1, $2, 3, now() - make_interval(days => $3))",
        [c.rows[0]!.id, s.salonId, days],
      );
    }
    const campaign = await asUser(db, s.ownerId, (tx) =>
      tx.query<{ id: string }>(
        "insert into public.campaigns (salon_id, name, channel, subject, body, segment) values ($1, 'Vraťte se', 'email', 'Chybíte nám', 'Ahoj {{first_name}}', '{\"inactive_days\":60}') returning id",
        [s.salonId],
      ),
    );
    const count = await asUser(db, s.ownerId, (tx) => tx.query<{ n: number }>("select public.launch_campaign($1) as n", [campaign.rows[0]!.id]));
    expect(count.rows[0]!.n).toBe(1);
    await expect(
      asUser(db, s.ownerId, (tx) => tx.query("select public.launch_campaign($1)", [campaign.rows[0]!.id])),
    ).rejects.toThrow(/invalid_status/);
  });
});
