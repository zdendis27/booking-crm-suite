-- Types
create type public.time_off_kind as enum ('vacation', 'sick', 'block');
create type public.override_kind as enum ('extra', 'off');
create type public.busy_kind as enum ('booking', 'time_off');

-- Staff
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  title text,
  bio text,
  photo_path text,
  color text not null default '#6d5efc' check (color ~ '^#[0-9a-fA-F]{6}$'),
  bookable boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, salon_id)
);
select public.attach_updated_at('public.staff');
create unique index staff_user_unique on public.staff (salon_id, user_id) where user_id is not null and archived_at is null;
create index staff_salon_idx on public.staff (salon_id) where archived_at is null;

create table public.staff_locations (
  staff_id uuid not null,
  location_id uuid not null,
  salon_id uuid not null references public.salons (id) on delete cascade,
  primary key (staff_id, location_id),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade
);

create table public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  location_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts time not null,
  ends time not null,
  valid_from date,
  valid_to date,
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade,
  check (ends > starts),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index staff_schedules_lookup_idx on public.staff_schedules (staff_id, location_id, weekday);

create table public.staff_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  location_id uuid not null,
  day date not null,
  kind public.override_kind not null,
  starts time,
  ends time,
  note text,
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade,
  check (
    (kind = 'off' and starts is null and ends is null)
    or (kind = 'extra' and starts is not null and ends is not null and ends > starts)
  )
);
create index staff_overrides_lookup_idx on public.staff_schedule_overrides (staff_id, location_id, day);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  during tstzrange not null check (not isempty(during) and lower_inf(during) = false and upper_inf(during) = false),
  kind public.time_off_kind not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade
);
create index staff_time_off_idx on public.staff_time_off using gist (staff_id, during);

create table public.staff_busy_slots (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  during tstzrange not null check (not isempty(during)),
  kind public.busy_kind not null,
  booking_item_id uuid unique,
  time_off_id uuid unique references public.staff_time_off (id) on delete cascade,
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  constraint staff_busy_no_overlap exclude using gist (staff_id with =, during with &&)
);
create index staff_busy_salon_idx on public.staff_busy_slots (salon_id, staff_id);

create function public.sync_time_off_busy_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    delete from public.staff_busy_slots where time_off_id = old.id;
  end if;
  begin
    insert into public.staff_busy_slots (salon_id, staff_id, during, kind, time_off_id)
    values (new.salon_id, new.staff_id, new.during, 'time_off', new.id);
  exception when exclusion_violation then
    raise exception 'time_off_conflict' using errcode = 'P0001';
  end;
  return new;
end
$$;

create trigger sync_time_off_busy_slot after insert or update of during, staff_id on public.staff_time_off
for each row execute function public.sync_time_off_busy_slot();

-- Services
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, salon_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  duration_min smallint not null check (duration_min between 5 and 720),
  buffer_after_min smallint not null default 0 check (buffer_after_min between 0 and 240),
  price bigint not null default 0 check (price >= 0),
  price_is_from boolean not null default false,
  vat_rate numeric(5, 2) not null default 0 check (vat_rate in (0, 12, 21)),
  online_bookable boolean not null default true,
  counts_for_loyalty boolean not null default true,
  color text,
  sort smallint not null default 0,
  processing_gap_start_min smallint,
  processing_gap_min smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, salon_id),
  foreign key (category_id, salon_id) references public.service_categories (id, salon_id) on delete set null (category_id)
);
select public.attach_updated_at('public.services');
create index services_salon_idx on public.services (salon_id) where archived_at is null;

create table public.staff_services (
  staff_id uuid not null,
  service_id uuid not null,
  salon_id uuid not null references public.salons (id) on delete cascade,
  price_override bigint check (price_override is null or price_override >= 0),
  duration_override smallint check (duration_override is null or duration_override between 5 and 720),
  primary key (staff_id, service_id),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (service_id, salon_id) references public.services (id, salon_id) on delete cascade
);
create index staff_services_service_idx on public.staff_services (service_id);

create function public.link_new_service_to_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_services (staff_id, service_id, salon_id)
  select s.id, new.id, new.salon_id from public.staff s
  where s.salon_id = new.salon_id and s.archived_at is null
  on conflict do nothing;
  return new;
end
$$;

create trigger link_new_service_to_staff after insert on public.services
for each row execute function public.link_new_service_to_staff();

create function public.link_new_staff_to_services() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_services (staff_id, service_id, salon_id)
  select new.id, s.id, new.salon_id from public.services s
  where s.salon_id = new.salon_id and s.archived_at is null
  on conflict do nothing;
  return new;
end
$$;

create trigger link_new_staff_to_services after insert on public.staff
for each row execute function public.link_new_staff_to_services();

-- Plan limits
create function public.plan_limit(p_salon uuid, p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((p.limits ->> p_key)::integer, 0)
  from public.salons s join public.plans p on p.code = s.plan_code
  where s.id = p_salon
$$;

create function public.plan_has_feature(p_salon uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p.limits -> 'features' ? p_feature, false)
  from public.salons s join public.plans p on p.code = s.plan_code
  where s.id = p_salon
$$;

create function public.enforce_staff_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is null and (
    select count(*) from public.staff where salon_id = new.salon_id and archived_at is null and id <> new.id
  ) >= public.plan_limit(new.salon_id, 'staff') then
    raise exception 'plan_limit_staff' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger enforce_staff_limit before insert or update of archived_at on public.staff
for each row execute function public.enforce_staff_limit();

create function public.enforce_location_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is null and (
    select count(*) from public.locations where salon_id = new.salon_id and archived_at is null and id <> new.id
  ) >= public.plan_limit(new.salon_id, 'locations') then
    raise exception 'plan_limit_locations' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger enforce_location_limit before insert or update of archived_at on public.locations
for each row execute function public.enforce_location_limit();

-- Invites
create table public.salon_invites (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  email extensions.citext not null,
  role public.salon_role not null check (role <> 'owner'),
  staff_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete set null (staff_id)
);
create index salon_invites_salon_idx on public.salon_invites (salon_id);

create function public.create_invite(
  p_salon uuid, p_email text, p_role public.salon_role, p_staff uuid default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.has_salon_role(p_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;
  insert into public.salon_invites (salon_id, email, role, staff_id, token_hash, created_by)
  values (p_salon, p_email, p_role, p_staff, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid());
  return v_token;
end
$$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.salon_invites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into v_invite from public.salon_invites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and accepted_at is null and expires_at > now();
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;
  if lower(v_invite.email::text) <> lower(coalesce(v_email, '')) then
    raise exception 'invite_email_mismatch' using errcode = 'P0001';
  end if;
  insert into public.memberships (salon_id, user_id, role)
  values (v_invite.salon_id, auth.uid(), v_invite.role)
  on conflict (salon_id, user_id) do update set role = excluded.role;
  if v_invite.staff_id is not null then
    update public.staff set user_id = auth.uid() where id = v_invite.staff_id;
  end if;
  update public.salon_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.salon_id;
end
$$;

-- Policies
select public.apply_tenant_rls('public.staff',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_locations',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_schedules',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_schedule_overrides',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_time_off',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_busy_slots',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  null);
select public.apply_tenant_rls('public.service_categories',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.services',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_services',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.salon_invites',
  array['owner', 'manager']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);

revoke execute on function public.create_invite(uuid, text, public.salon_role, uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
