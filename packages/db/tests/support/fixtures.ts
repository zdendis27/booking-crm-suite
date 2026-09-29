import { createUser, type Db } from "./harness";

export interface SeededSalon {
  ownerId: string;
  salonId: string;
  locationId: string;
  staffId: string;
  staffUserId: string;
  serviceId: string;
  shortServiceId: string;
  clientId: string;
  monday: string;
}

export function upcomingMonday(minDaysAhead = 7): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minDaysAhead);
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

const pragueOffset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Prague", timeZoneName: "longOffset" });

export function pragueTs(day: string, time: string): string {
  const probe = new Date(`${day}T12:00:00Z`);
  const part = pragueOffset.formatToParts(probe).find((p) => p.type === "timeZoneName")!.value;
  const offset = part.replace("GMT", "") || "+00:00";
  return `${day} ${time}${offset}`;
}

export async function seedSalon(
  db: Db,
  slug: string,
  opts: { plan?: string; policy?: "email" | "email_phone"; mode?: "auto" | "manual" } = {},
): Promise<SeededSalon> {
  const ownerId = await createUser(db, `owner-${slug}@example.cz`);
  const staffUserId = await createUser(db, `staff-${slug}@example.cz`);
  const salon = await db.query<{ id: string }>(
    "insert into public.salons (name, slug, plan_code, verification_policy) values ($1, $2, $3, $4) returning id",
    [`Salon ${slug}`, slug, opts.plan ?? "business", opts.policy ?? "email"],
  );
  const salonId = salon.rows[0]!.id;
  await db.query("insert into public.memberships (salon_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')", [
    salonId,
    ownerId,
    staffUserId,
  ]);
  const location = await db.query<{ id: string }>(
    "insert into public.locations (salon_id, name, slug) values ($1, 'Praha', 'praha') returning id",
    [salonId],
  );
  const locationId = location.rows[0]!.id;
  await db.query(
    "insert into public.location_booking_settings (location_id, salon_id, confirmation_mode, min_notice_min) values ($1, $2, $3, 60)",
    [locationId, salonId, opts.mode ?? "auto"],
  );
  const staff = await db.query<{ id: string }>(
    "insert into public.staff (salon_id, display_name, user_id) values ($1, 'Barber A', $2) returning id",
    [salonId, staffUserId],
  );
  const staffId = staff.rows[0]!.id;
  await db.query("insert into public.staff_locations (staff_id, location_id, salon_id) values ($1, $2, $3)", [
    staffId,
    locationId,
    salonId,
  ]);
  for (let weekday = 1; weekday <= 5; weekday++) {
    await db.query(
      "insert into public.staff_schedules (salon_id, staff_id, location_id, weekday, starts, ends) values ($1, $2, $3, $4, '09:00', '17:00')",
      [salonId, staffId, locationId, weekday],
    );
  }
  const service = await db.query<{ id: string }>(
    "insert into public.services (salon_id, name, duration_min, price) values ($1, 'Střih', 30, 45000) returning id",
    [salonId],
  );
  const shortService = await db.query<{ id: string }>(
    "insert into public.services (salon_id, name, duration_min, buffer_after_min, price) values ($1, 'Vousy', 15, 5, 20000) returning id",
    [salonId],
  );
  const client = await db.query<{ id: string }>(
    "insert into public.clients (salon_id, first_name, last_name, email, phone) values ($1, 'Petr', 'Novák', 'petr@example.cz', '+420777000001') returning id",
    [salonId],
  );
  return {
    ownerId,
    salonId,
    locationId,
    staffId,
    staffUserId,
    serviceId: service.rows[0]!.id,
    shortServiceId: shortService.rows[0]!.id,
    clientId: client.rows[0]!.id,
    monday: upcomingMonday(),
  };
}
