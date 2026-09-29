-- Types
create type public.booking_status as enum (
  'pending', 'confirmed', 'completed', 'cancelled_by_client', 'cancelled_by_salon', 'no_show'
);
create type public.booking_source as enum ('online', 'admin', 'walk_in', 'phone');
create type public.adjustment_kind as enum ('loyalty_reward', 'promo', 'voucher', 'manual');

-- Bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid not null,
  client_id uuid not null,
  primary_staff_id uuid,
  status public.booking_status not null default 'confirmed',
  source public.booking_source not null default 'admin',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_total bigint not null default 0 check (price_total >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  client_note text,
  internal_note text,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  confirmed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  deposit_amount bigint not null default 0 check (deposit_amount >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id),
  check (ends_at > starts_at),
  foreign key (location_id, salon_id) references public.locations (id, salon_id),
  foreign key (client_id, salon_id) references public.clients (id, salon_id),
  foreign key (primary_staff_id, salon_id) references public.staff (id, salon_id)
);
select public.attach_updated_at('public.bookings');
create index bookings_calendar_idx on public.bookings (salon_id, location_id, starts_at);
create index bookings_client_idx on public.bookings (client_id, starts_at desc);
create index bookings_status_idx on public.bookings (salon_id, status, starts_at);
create index bookings_expires_idx on public.bookings (expires_at) where status = 'pending' and expires_at is not null;

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null,
  service_id uuid not null,
  staff_id uuid not null,
  position smallint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_after_min smallint not null default 0,
  name_snap text not null,
  duration_snap smallint not null,
  price_snap bigint not null check (price_snap >= 0),
  vat_snap numeric(5, 2) not null default 0,
  unique (id, salon_id),
  check (ends_at > starts_at),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id) on delete cascade,
  foreign key (service_id, salon_id) references public.services (id, salon_id),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id)
);
create index booking_items_booking_idx on public.booking_items (booking_id, position);
create index booking_items_staff_idx on public.booking_items (staff_id, starts_at);

alter table public.staff_busy_slots
  add constraint staff_busy_booking_item_fk
  foreign key (booking_item_id) references public.booking_items (id) on delete cascade;

create table public.booking_adjustments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null,
  kind public.adjustment_kind not null,
  label text not null,
  amount bigint not null check (amount <= 0),
  ref_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id) on delete cascade
);
create index booking_adjustments_booking_idx on public.booking_adjustments (booking_id);

create function public.sync_booking_discount() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_booking uuid := coalesce(new.booking_id, old.booking_id);
begin
  update public.bookings
  set discount_total = coalesce((select sum(-amount) from public.booking_adjustments where booking_id = v_booking), 0)
  where id = v_booking;
  return null;
end
$$;

create trigger sync_booking_discount after insert or update or delete on public.booking_adjustments
for each row execute function public.sync_booking_discount();

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid not null,
  client_id uuid not null,
  service_ids uuid[] not null,
  staff_id uuid,
  date_from date not null,
  date_to date not null,
  time_from time,
  time_to time,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'booked', 'expired', 'cancelled')),
  offered_at timestamptz,
  created_at timestamptz not null default now(),
  check (date_to >= date_from),
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade,
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade
);
create index waitlist_lookup_idx on public.waitlist_entries (location_id, status, date_from, date_to);

-- Access helpers
create function public.booking_has_staff_user(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_items bi join public.staff s on s.id = bi.staff_id
    where bi.booking_id = p_booking and s.user_id = auth.uid()
  )
$$;

create function public.booking_is_customers(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b join public.clients c on c.id = b.client_id
    where b.id = p_booking and c.customer_account_id = public.current_customer_account_id()
  )
$$;

create function public.staff_has_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.client_id = p_client and public.booking_has_staff_user(b.id)
  )
$$;

-- Availability
create function public.get_availability(
  p_location uuid,
  p_service_ids uuid[],
  p_from date,
  p_to date,
  p_staff uuid default null
) returns table (staff_id uuid, slot_start timestamptz, slot_end timestamptz)
language sql stable security definer set search_path = '' as $$
with ctx as (
  select l.id as location_id, l.salon_id, s.timezone as tz,
         bs.slot_interval_min, bs.min_notice_min, bs.max_advance_days
  from public.locations l
  join public.salons s on s.id = l.salon_id
  join public.location_booking_settings bs on bs.location_id = l.id
  where l.id = p_location and l.archived_at is null and s.archived_at is null and s.status <> 'suspended'
),
wanted as (
  select u.service_id, u.ord from unnest(p_service_ids) with ordinality as u(service_id, ord)
),
svc as (
  select w.ord, sv.id as service_id, sv.duration_min, sv.buffer_after_min
  from wanted w
  join public.services sv on sv.id = w.service_id
  join ctx on ctx.salon_id = sv.salon_id
  where sv.archived_at is null
),
cand as (
  select st.id as staff_id,
         sum(coalesce(ss.duration_override, svc.duration_min))::int as dur_min,
         sum(svc.buffer_after_min)::int as buf_all,
         (array_agg(svc.buffer_after_min order by svc.ord desc))[1]::int as buf_last
  from ctx
  join public.staff st on st.salon_id = ctx.salon_id and st.archived_at is null and st.bookable
  join public.staff_locations sl on sl.staff_id = st.id and sl.location_id = ctx.location_id
  join svc on true
  join public.staff_services ss on ss.staff_id = st.id and ss.service_id = svc.service_id
  where p_staff is null or st.id = p_staff
  group by st.id
  having count(*) = (select count(*) from svc)
     and (select count(*) from svc) = coalesce(array_length(p_service_ids, 1), 0)
),
days as (
  select d::date as day
  from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') d
),
weekly as (
  select c.staff_id, d.day, sch.starts, sch.ends
  from cand c
  cross join days d
  cross join ctx
  join public.staff_schedules sch
    on sch.staff_id = c.staff_id and sch.location_id = ctx.location_id
   and sch.weekday = extract(isodow from d.day)::int
   and (sch.valid_from is null or sch.valid_from <= d.day)
   and (sch.valid_to is null or sch.valid_to >= d.day)
  where not exists (
    select 1 from public.staff_schedule_overrides o
    where o.staff_id = c.staff_id and o.location_id = ctx.location_id and o.day = d.day and o.kind = 'off'
  )
),
extra as (
  select c.staff_id, o.day, o.starts, o.ends
  from cand c
  cross join ctx
  join public.staff_schedule_overrides o
    on o.staff_id = c.staff_id and o.location_id = ctx.location_id and o.kind = 'extra'
  join days d on d.day = o.day
),
ranges as (
  select r.staff_id,
         (r.day + r.starts) at time zone ctx.tz as r_start,
         (r.day + r.ends) at time zone ctx.tz as r_end
  from (select * from weekly union all select * from extra) r
  cross join ctx
),
slots as (
  select distinct c.staff_id, g as slot_start,
         g + make_interval(mins => c.dur_min + c.buf_all - c.buf_last) as slot_end,
         g + make_interval(mins => c.dur_min + c.buf_all) as busy_end
  from ranges r
  join cand c on c.staff_id = r.staff_id
  cross join ctx
  cross join lateral generate_series(
    r.r_start,
    r.r_end - make_interval(mins => c.dur_min + c.buf_all - c.buf_last),
    make_interval(mins => ctx.slot_interval_min)
  ) g
  where g >= now() + make_interval(mins => ctx.min_notice_min)
    and g <= now() + make_interval(days => ctx.max_advance_days)
)
select s.staff_id, s.slot_start, s.slot_end
from slots s
where not exists (
  select 1 from public.staff_busy_slots b
  where b.staff_id = s.staff_id and b.during && tstzrange(s.slot_start, s.busy_end, '[)')
)
order by s.slot_start, s.staff_id
$$;

revoke execute on function public.get_availability(uuid, uuid[], date, date, uuid) from public, anon;

-- Booking creation core
create function public._insert_item_busy_slots(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_busy_slots (salon_id, staff_id, during, kind, booking_item_id)
  select bi.salon_id, bi.staff_id,
         tstzrange(bi.starts_at, bi.ends_at + make_interval(mins => bi.buffer_after_min), '[)'),
         'booking', bi.id
  from public.booking_items bi where bi.booking_id = p_booking;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end
$$;

create function public._booking_created_hook(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  null;
end
$$;

create function public._booking_moved_hook(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  null;
end
$$;

create function public._deposit_required(p_salon uuid, p_client uuid, p_total bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  return 0;
end
$$;

revoke execute on function public._deposit_required(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function public._booking_created_hook(uuid) from public, anon, authenticated;
revoke execute on function public._booking_moved_hook(uuid) from public, anon, authenticated;

create function public._create_booking(
  p_salon uuid,
  p_location uuid,
  p_client uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_source public.booking_source,
  p_status public.booking_status,
  p_expires_at timestamptz,
  p_client_note text,
  p_internal_note text,
  p_created_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking uuid;
  v_item record;
  v_service public.services;
  v_staff public.staff;
  v_ss public.staff_services;
  v_cursor timestamptz := p_starts_at;
  v_dur integer;
  v_price bigint;
  v_total bigint := 0;
  v_end timestamptz;
  v_first_staff uuid;
begin
  if not exists (select 1 from public.locations where id = p_location and salon_id = p_salon and archived_at is null) then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clients where id = p_client and salon_id = p_salon and merged_into is null) then
    raise exception 'client_not_found' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    salon_id, location_id, client_id, status, source, starts_at, ends_at, expires_at,
    client_note, internal_note, created_by, confirmed_at
  ) values (
    p_salon, p_location, p_client, p_status, p_source, p_starts_at, p_starts_at + interval '1 minute', p_expires_at,
    p_client_note, p_internal_note, p_created_by, case when p_status = 'confirmed' then now() end
  ) returning id into v_booking;

  for v_item in
    select (e.value ->> 'service_id')::uuid as service_id, (e.value ->> 'staff_id')::uuid as staff_id, e.ordinality
    from jsonb_array_elements(p_items) with ordinality as e(value, ordinality)
  loop
    select * into v_service from public.services
    where id = v_item.service_id and salon_id = p_salon and archived_at is null;
    if not found then
      raise exception 'service_not_found' using errcode = 'P0001';
    end if;
    select * into v_staff from public.staff
    where id = v_item.staff_id and salon_id = p_salon and archived_at is null;
    if not found then
      raise exception 'staff_not_found' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.staff_locations where staff_id = v_staff.id and location_id = p_location) then
      raise exception 'staff_not_at_location' using errcode = 'P0001';
    end if;
    select * into v_ss from public.staff_services where staff_id = v_staff.id and service_id = v_service.id;
    if not found then
      raise exception 'staff_cannot_perform' using errcode = 'P0001';
    end if;
    v_dur := coalesce(v_ss.duration_override, v_service.duration_min);
    v_price := coalesce(v_ss.price_override, v_service.price);
    v_end := v_cursor + make_interval(mins => v_dur);
    insert into public.booking_items (
      salon_id, booking_id, service_id, staff_id, position, starts_at, ends_at, buffer_after_min,
      name_snap, duration_snap, price_snap, vat_snap
    ) values (
      p_salon, v_booking, v_service.id, v_staff.id, v_item.ordinality, v_cursor, v_end, v_service.buffer_after_min,
      v_service.name, v_dur, v_price, v_service.vat_rate
    );
    v_total := v_total + v_price;
    if v_first_staff is null then
      v_first_staff := v_staff.id;
    end if;
    v_cursor := v_end + make_interval(mins => v_service.buffer_after_min);
  end loop;

  perform public._insert_item_busy_slots(v_booking);

  update public.bookings
  set ends_at = v_end, price_total = v_total, primary_staff_id = v_first_staff
  where id = v_booking;
  perform public._booking_created_hook(v_booking);
  return v_booking;
end
$$;

create function public._link_client(p_salon uuid, p_account uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid;
  v_account public.customer_accounts;
  v_first text;
  v_last text;
begin
  select id into v_client from public.clients
  where salon_id = p_salon and customer_account_id = p_account and merged_into is null;
  if found then
    return v_client;
  end if;
  select * into v_account from public.customer_accounts where id = p_account;
  select id into v_client from public.clients
  where salon_id = p_salon and customer_account_id is null and merged_into is null and anonymized_at is null
    and (
      (v_account.phone_verified_at is not null and phone = v_account.phone)
      or (v_account.email_verified_at is not null and email = v_account.email)
    )
  order by created_at limit 1;
  if found then
    update public.clients set
      customer_account_id = p_account,
      phone_verified_at = case when phone = v_account.phone then v_account.phone_verified_at else phone_verified_at end,
      email_verified_at = case when email = v_account.email then v_account.email_verified_at else email_verified_at end
    where id = v_client;
    return v_client;
  end if;
  v_first := coalesce(nullif(v_account.first_name, ''), split_part(coalesce(v_account.email::text, 'Zákazník'), '@', 1));
  v_last := coalesce(v_account.last_name, '');
  insert into public.clients (
    salon_id, customer_account_id, first_name, last_name, phone, email, phone_verified_at, email_verified_at, source
  ) values (
    p_salon, p_account, v_first, v_last,
    case when exists (
      select 1 from public.clients c
      where c.salon_id = p_salon and c.phone = v_account.phone and c.merged_into is null
    ) then null else v_account.phone end,
    v_account.email, v_account.phone_verified_at, v_account.email_verified_at, 'online'
  ) returning id into v_client;
  return v_client;
end
$$;

revoke execute on function public._insert_item_busy_slots(uuid) from public, anon, authenticated;
revoke execute on function public._create_booking(uuid, uuid, uuid, jsonb, timestamptz, public.booking_source, public.booking_status, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._link_client(uuid, uuid) from public, anon, authenticated;

-- Booking API
create function public.admin_create_booking(
  p_location uuid,
  p_client uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_source public.booking_source default 'admin',
  p_client_note text default null,
  p_internal_note text default null,
  p_status public.booking_status default 'confirmed'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.locations where id = p_location;
  if v_salon is null then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  if p_status not in ('pending', 'confirmed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    if not public.has_salon_role(v_salon, array['staff']::public.salon_role[])
       or exists (
         select 1 from jsonb_array_elements(p_items) e
         where not exists (
           select 1 from public.staff s where s.id = (e ->> 'staff_id')::uuid and s.user_id = auth.uid()
         )
       ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return public._create_booking(
    v_salon, p_location, p_client, p_items, p_starts_at, p_source, p_status, null,
    p_client_note, p_internal_note, auth.uid()
  );
end
$$;

create function public.customer_create_booking(
  p_location uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_client_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_account public.customer_accounts;
  v_salon public.salons;
  v_settings public.location_booking_settings;
  v_client uuid;
  v_service_ids uuid[];
  v_staff_ids uuid[];
  v_status public.booking_status;
  v_expires timestamptz;
  v_total bigint;
  v_deposit bigint;
  v_booking uuid;
begin
  select * into v_account from public.customer_accounts where user_id = auth.uid();
  if not found then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select s.* into v_salon from public.locations l join public.salons s on s.id = l.salon_id
  where l.id = p_location and l.archived_at is null;
  if not found then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;
  select * into v_settings from public.location_booking_settings where location_id = p_location;
  if v_account.email_verified_at is null
     or (v_salon.verification_policy = 'email_phone' and v_account.phone_verified_at is null) then
    raise exception 'verification_required' using errcode = 'P0001';
  end if;
  select array_agg((e ->> 'service_id')::uuid order by ord), array_agg(distinct (e ->> 'staff_id')::uuid)
  into v_service_ids, v_staff_ids
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  if v_service_ids is null or array_length(v_staff_ids, 1) <> 1 then
    raise exception 'unsupported_items' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.services where id = any (v_service_ids) and (not online_bookable or salon_id <> v_salon.id)
  ) then
    raise exception 'service_not_bookable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.get_availability(
      p_location, v_service_ids,
      (p_starts_at at time zone v_salon.timezone)::date,
      (p_starts_at at time zone v_salon.timezone)::date,
      v_staff_ids[1]
    ) g where g.slot_start = p_starts_at
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  v_client := public._link_client(v_salon.id, v_account.id);
  if (
    select count(*) from public.bookings
    where client_id = v_client and status in ('pending', 'confirmed') and starts_at > now()
  ) >= 10 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;
  select coalesce(sum(coalesce(ss.price_override, sv.price)), 0) into v_total
  from jsonb_array_elements(p_items) e
  join public.services sv on sv.id = (e ->> 'service_id')::uuid
  join public.staff_services ss on ss.service_id = sv.id and ss.staff_id = (e ->> 'staff_id')::uuid;
  v_deposit := public._deposit_required(v_salon.id, v_client, v_total);
  if v_deposit > 0 then
    v_status := 'pending';
    v_expires := now() + make_interval(mins => v_settings.hold_minutes);
  else
    v_status := case when v_settings.confirmation_mode = 'auto' then 'confirmed' else 'pending' end;
  end if;
  v_booking := public._create_booking(
    v_salon.id, p_location, v_client, p_items, p_starts_at, 'online', v_status, v_expires,
    p_client_note, null, auth.uid()
  );
  if v_deposit > 0 then
    update public.bookings set deposit_amount = v_deposit where id = v_booking;
  end if;
  return v_booking;
end
$$;

create function public._move_booking(p_booking uuid, p_new_start timestamptz, p_new_staff uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_delta interval;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  v_delta := p_new_start - v_booking.starts_at;
  if p_new_staff is not null then
    if exists (
      select 1 from public.booking_items bi
      where bi.booking_id = p_booking and not exists (
        select 1 from public.staff_services ss
        join public.staff_locations sl on sl.staff_id = ss.staff_id and sl.location_id = v_booking.location_id
        where ss.staff_id = p_new_staff and ss.service_id = bi.service_id
      )
    ) then
      raise exception 'staff_cannot_perform' using errcode = 'P0001';
    end if;
  end if;
  delete from public.staff_busy_slots
  where booking_item_id in (select id from public.booking_items where booking_id = p_booking);
  update public.booking_items
  set staff_id = coalesce(p_new_staff, staff_id), starts_at = starts_at + v_delta, ends_at = ends_at + v_delta
  where booking_id = p_booking;
  perform public._insert_item_busy_slots(p_booking);
  update public.bookings
  set starts_at = starts_at + v_delta, ends_at = ends_at + v_delta,
      primary_staff_id = coalesce(p_new_staff, primary_staff_id)
  where id = p_booking;
  perform public._booking_moved_hook(p_booking);
end
$$;

revoke execute on function public._move_booking(uuid, timestamptz, uuid) from public, anon, authenticated;

create function public.move_booking(p_booking uuid, p_new_start timestamptz, p_new_staff uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  if not (
    public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[])
    or (public.has_salon_role(v_booking.salon_id, array['staff']::public.salon_role[]) and public.booking_has_staff_user(p_booking))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  perform public._move_booking(p_booking, p_new_start, p_new_staff);
end
$$;

create function public.customer_reschedule_booking(p_booking uuid, p_new_start timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_salon public.salons;
  v_settings public.location_booking_settings;
  v_service_ids uuid[];
  v_staff uuid;
begin
  select * into v_booking from public.bookings where id = p_booking;
  if not found or not public.booking_is_customers(p_booking) then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select * into v_salon from public.salons where id = v_booking.salon_id;
  select * into v_settings from public.location_booking_settings where location_id = v_booking.location_id;
  if now() > v_booking.starts_at - make_interval(hours => v_settings.cancel_deadline_h) then
    raise exception 'cancel_deadline_passed' using errcode = 'P0001';
  end if;
  select array_agg(service_id order by position), (array_agg(staff_id order by position))[1]
  into v_service_ids, v_staff
  from public.booking_items where booking_id = p_booking;
  if not exists (
    select 1 from public.get_availability(
      v_booking.location_id, v_service_ids,
      (p_new_start at time zone v_salon.timezone)::date,
      (p_new_start at time zone v_salon.timezone)::date,
      v_staff
    ) g where g.slot_start = p_new_start
  ) and not exists (
    select 1 where p_new_start = v_booking.starts_at
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  perform public._move_booking(p_booking, p_new_start, null);
end
$$;

-- Status changes
create function public.booking_transition_allowed(
  p_old public.booking_status, p_new public.booking_status
) returns boolean
language sql immutable as $$
  select case p_old
    when 'pending' then p_new in ('confirmed', 'cancelled_by_client', 'cancelled_by_salon')
    when 'confirmed' then p_new in ('completed', 'no_show', 'cancelled_by_client', 'cancelled_by_salon')
    when 'completed' then p_new in ('confirmed')
    when 'no_show' then p_new in ('confirmed', 'completed')
    when 'cancelled_by_client' then p_new in ('confirmed')
    when 'cancelled_by_salon' then p_new in ('confirmed')
    else false
  end
$$;

create function public.set_booking_status(
  p_booking uuid, p_status public.booking_status, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_settings public.location_booking_settings;
  v_is_ops boolean;
  v_is_mgmt boolean;
  v_is_own_staff boolean;
  v_is_customer boolean;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  v_is_ops := public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]);
  v_is_mgmt := public.has_salon_role(v_booking.salon_id, array['owner', 'manager']::public.salon_role[]);
  v_is_own_staff := public.has_salon_role(v_booking.salon_id, array['staff']::public.salon_role[])
    and public.booking_has_staff_user(p_booking);
  v_is_customer := public.booking_is_customers(p_booking);
  if not public.booking_transition_allowed(v_booking.status, p_status) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if v_is_ops or v_is_own_staff then
    if v_booking.status in ('completed') and not v_is_mgmt then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if p_status = 'cancelled_by_client' and not v_is_ops then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif v_is_customer then
    if p_status <> 'cancelled_by_client' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into v_settings from public.location_booking_settings where location_id = v_booking.location_id;
    if now() > v_booking.starts_at - make_interval(hours => v_settings.cancel_deadline_h) then
      raise exception 'cancel_deadline_passed' using errcode = 'P0001';
    end if;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.bookings set
    status = p_status,
    cancel_reason = case when p_status in ('cancelled_by_client', 'cancelled_by_salon', 'no_show') then p_reason else null end,
    cancelled_at = case when p_status in ('cancelled_by_client', 'cancelled_by_salon') then now() else null end,
    cancelled_by = case when p_status in ('cancelled_by_client', 'cancelled_by_salon') then auth.uid() else null end,
    confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else null end,
    expires_at = case when p_status = 'pending' then expires_at else null end
  where id = p_booking;
end
$$;

create function public.booking_status_side_effects() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old_active boolean := old.status in ('pending', 'confirmed', 'completed');
  v_new_active boolean := new.status in ('pending', 'confirmed', 'completed');
begin
  if v_old_active and not v_new_active then
    delete from public.staff_busy_slots
    where booking_item_id in (select id from public.booking_items where booking_id = new.id);
  elsif not v_old_active and v_new_active then
    perform public._insert_item_busy_slots(new.id);
  end if;
  return new;
end
$$;

create trigger a_booking_status_side_effects after update of status on public.bookings
for each row when (old.status is distinct from new.status)
execute function public.booking_status_side_effects();

create function public.expire_pending_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.bookings
    set status = 'cancelled_by_salon', cancel_reason = 'expired', cancelled_at = now(), expires_at = null
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end
$$;

revoke execute on function public.expire_pending_bookings() from public, anon, authenticated;

create function public.update_booking_notes(
  p_booking uuid, p_internal_note text, p_client_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.bookings where id = p_booking;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.bookings set internal_note = p_internal_note, client_note = coalesce(p_client_note, client_note)
  where id = p_booking;
end
$$;

create function public.add_booking_adjustment(
  p_booking uuid, p_kind public.adjustment_kind, p_label text, p_amount bigint, p_ref uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking;
  if not found or not public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount > 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if -p_amount + v_booking.discount_total > v_booking.price_total then
    raise exception 'discount_exceeds_price' using errcode = 'P0001';
  end if;
  insert into public.booking_adjustments (salon_id, booking_id, kind, label, amount, ref_id, created_by)
  values (v_booking.salon_id, p_booking, p_kind, p_label, p_amount, p_ref, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

revoke execute on function public.admin_create_booking(uuid, uuid, jsonb, timestamptz, public.booking_source, text, text, public.booking_status) from public, anon;
revoke execute on function public.customer_create_booking(uuid, jsonb, timestamptz, text) from public, anon;
revoke execute on function public.move_booking(uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.customer_reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.set_booking_status(uuid, public.booking_status, text) from public, anon;
revoke execute on function public.update_booking_notes(uuid, text, text) from public, anon;
revoke execute on function public.add_booking_adjustment(uuid, public.adjustment_kind, text, bigint, uuid) from public, anon;

-- Policies
alter table public.bookings enable row level security;
create policy bookings_ops on public.bookings for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy bookings_staff on public.bookings for select to authenticated
  using (public.has_salon_role(salon_id, array['staff']::public.salon_role[]) and public.booking_has_staff_user(id));
create policy bookings_customer on public.bookings for select to authenticated
  using (public.booking_is_customers(id));

alter table public.booking_items enable row level security;
create policy booking_items_ops on public.booking_items for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy booking_items_staff on public.booking_items for select to authenticated
  using (public.has_salon_role(salon_id, array['staff']::public.salon_role[]) and public.booking_has_staff_user(booking_id));
create policy booking_items_customer on public.booking_items for select to authenticated
  using (public.booking_is_customers(booking_id));

alter table public.booking_adjustments enable row level security;
create policy booking_adjustments_ops on public.booking_adjustments for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy booking_adjustments_customer on public.booking_adjustments for select to authenticated
  using (public.booking_is_customers(booking_id));

select public.apply_tenant_rls('public.waitlist_entries',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);

create policy clients_staff_read on public.clients for select to authenticated
  using (public.has_salon_role(salon_id, array['staff']::public.salon_role[]) and public.staff_has_client(id));
create policy client_notes_staff_read on public.client_notes for select to authenticated
  using (public.has_salon_role(salon_id, array['staff']::public.salon_role[]) and public.staff_has_client(client_id));
create policy client_stats_staff_read on public.client_stats for select to authenticated
  using (public.has_salon_role(salon_id, array['staff']::public.salon_role[]) and public.staff_has_client(client_id));
