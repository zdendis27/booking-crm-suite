-- Extensions
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Types
create type public.salon_role as enum ('owner', 'manager', 'reception', 'staff');
create type public.salon_status as enum ('trial', 'active', 'suspended');
create type public.verification_policy as enum ('email', 'email_phone');
create type public.confirmation_mode as enum ('auto', 'manual');

-- Generic helpers
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create function public.attach_updated_at(p_table regclass) returns void
language plpgsql as $$
begin
  execute format(
    'create trigger set_updated_at before update on %s for each row execute function public.set_updated_at()',
    p_table
  );
end
$$;

create function public.normalize_email() returns trigger
language plpgsql as $$
declare
  v_key text;
  v_row jsonb := to_jsonb(new);
begin
  foreach v_key in array array['email', 'customer_email', 'recipient_email'] loop
    if v_row ? v_key and v_row ->> v_key is not null then
      new := jsonb_populate_record(new, jsonb_build_object(v_key, lower(btrim(v_row ->> v_key))));
    end if;
  end loop;
  return new;
end
$$;

create function public.attach_email_normalizer(p_table regclass) returns void
language plpgsql as $$
begin
  execute format(
    'create trigger normalize_email before insert or update on %s for each row execute function public.normalize_email()',
    p_table
  );
end
$$;

create function public.is_privileged_role() returns boolean
language sql stable as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin')
$$;

-- Plans
create table public.plans (
  code text primary key,
  name text not null,
  price_monthly bigint not null default 0 check (price_monthly >= 0),
  limits jsonb not null default '{}'::jsonb,
  sort smallint not null default 0
);

insert into public.plans (code, name, price_monthly, limits, sort) values
  ('free', 'FREE', 0,
    '{"staff":1,"locations":1,"sms_included":0,"features":[]}', 0),
  ('solo', 'SOLO', 29900,
    '{"staff":1,"locations":1,"sms_included":0,"features":["loyalty","automations","waitlist"]}', 1),
  ('pro', 'PRO', 59900,
    '{"staff":5,"locations":1,"sms_included":100,"features":["loyalty","automations","waitlist","payments","vouchers","finance","deposits"]}', 2),
  ('business', 'BUSINESS', 99900,
    '{"staff":15,"locations":3,"sms_included":300,"features":["loyalty","automations","waitlist","payments","vouchers","finance","deposits","invoicing","inventory","commissions","marketing","ai"]}', 3),
  ('multi', 'MULTI', 149900,
    '{"staff":999,"locations":99,"sms_included":1000,"features":["loyalty","automations","waitlist","payments","vouchers","finance","deposits","invoicing","inventory","commissions","marketing","ai"]}', 4);

alter table public.plans enable row level security;
create policy plans_read on public.plans for select to anon, authenticated using (true);

-- Salons
create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  timezone text not null default 'Europe/Prague',
  currency text not null default 'CZK',
  status public.salon_status not null default 'trial',
  plan_code text not null default 'free' references public.plans (code),
  verification_policy public.verification_policy not null default 'email',
  description text,
  phone text,
  email text check (email is null or email = lower(email)),
  website text,
  instagram text,
  address_street text,
  address_city text,
  address_zip text,
  logo_path text,
  cover_path text,
  brand_color text not null default '#6d5efc' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  google_review_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
select public.attach_updated_at('public.salons');
select public.attach_email_normalizer('public.salons');

create table public.salon_billing_profiles (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  legal_name text,
  ico text check (ico is null or ico ~ '^[0-9]{8}$'),
  dic text check (dic is null or dic ~ '^[A-Z]{2}[0-9A-Z]{2,12}$'),
  vat_payer boolean not null default false,
  address_street text,
  address_city text,
  address_zip text,
  country text not null default 'CZ',
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  bank_account text,
  swift text,
  invoice_note text,
  invoice_logo_path text,
  default_due_days smallint not null default 14 check (default_due_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.salon_billing_profiles');

create table public.subscriptions (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  plan_code text not null references public.plans (code),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.subscriptions');

-- Locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}$'),
  address_street text,
  address_city text,
  address_zip text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  phone text,
  email text check (email is null or email = lower(email)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (salon_id, slug),
  unique (id, salon_id)
);
select public.attach_updated_at('public.locations');
select public.attach_email_normalizer('public.locations');
create index locations_salon_idx on public.locations (salon_id);

create table public.location_hours (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade,
  check (closes > opens)
);
create index location_hours_location_idx on public.location_hours (location_id, weekday);

create table public.location_booking_settings (
  location_id uuid primary key,
  salon_id uuid not null references public.salons (id) on delete cascade,
  slot_interval_min smallint not null default 15 check (slot_interval_min in (5, 10, 15, 20, 30, 60)),
  min_notice_min integer not null default 60 check (min_notice_min >= 0),
  max_advance_days integer not null default 90 check (max_advance_days between 1 and 730),
  cancel_deadline_h integer not null default 24 check (cancel_deadline_h >= 0),
  confirmation_mode public.confirmation_mode not null default 'auto',
  hold_minutes smallint not null default 10 check (hold_minutes between 1 and 120),
  foreign key (location_id, salon_id) references public.locations (id, salon_id) on delete cascade
);

-- Users and roles
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.profiles');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.salon_role not null,
  created_at timestamptz not null default now(),
  unique (salon_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_salon_idx on public.audit_log (salon_id, created_at desc);

-- Access helpers
create function public.current_salon_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select salon_id from public.memberships where user_id = auth.uid()
$$;

create function public.has_salon_role(p_salon uuid, p_roles public.salon_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and salon_id = p_salon and role = any (p_roles)
  )
$$;

create function public.is_salon_member(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships where user_id = auth.uid() and salon_id = p_salon
  )
$$;

create function public.apply_tenant_rls(
  p_table regclass,
  p_read public.salon_role[],
  p_write public.salon_role[]
) returns void
language plpgsql as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy tenant_select on %s for select to authenticated using (public.has_salon_role(salon_id, %L::public.salon_role[]))',
    p_table, p_read
  );
  if p_write is not null then
    execute format(
      'create policy tenant_insert on %s for insert to authenticated with check (public.has_salon_role(salon_id, %L::public.salon_role[]))',
      p_table, p_write
    );
    execute format(
      'create policy tenant_update on %s for update to authenticated using (public.has_salon_role(salon_id, %L::public.salon_role[])) with check (public.has_salon_role(salon_id, %L::public.salon_role[]))',
      p_table, p_write, p_write
    );
    execute format(
      'create policy tenant_delete on %s for delete to authenticated using (public.has_salon_role(salon_id, %L::public.salon_role[]))',
      p_table, p_write
    );
  end if;
end
$$;

revoke execute on function public.apply_tenant_rls(regclass, public.salon_role[], public.salon_role[]) from public, anon, authenticated;
revoke execute on function public.attach_updated_at(regclass) from public, anon, authenticated;
revoke execute on function public.attach_email_normalizer(regclass) from public, anon, authenticated;

-- Audit helper
create function public.write_audit(
  p_salon uuid, p_action text, p_entity text, p_entity_id uuid, p_before jsonb, p_after jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (salon_id, actor_id, action, entity, entity_id, before, after)
  values (p_salon, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after)
$$;

revoke execute on function public.write_audit(uuid, text, text, uuid, jsonb, jsonb) from public, anon;

-- Guards
create function public.guard_salon_admin_columns() returns trigger
language plpgsql as $$
begin
  if not public.is_privileged_role() then
    if new.plan_code is distinct from old.plan_code
       or new.status is distinct from old.status
       or new.created_by is distinct from old.created_by then
      raise exception 'forbidden_column_change' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create trigger guard_salon_admin_columns before update on public.salons
for each row execute function public.guard_salon_admin_columns();

create function public.guard_last_owner() returns trigger
language plpgsql as $$
declare
  v_salon uuid := coalesce(old.salon_id, new.salon_id);
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (
      select 1 from public.memberships
      where salon_id = v_salon and role = 'owner' and id <> old.id
    ) then
      if tg_op = 'DELETE' and not exists (select 1 from public.salons where id = v_salon) then
        return old;
      end if;
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger guard_last_owner before update or delete on public.memberships
for each row execute function public.guard_last_owner();

-- Policies
alter table public.salons enable row level security;
create policy salons_select on public.salons for select to authenticated
  using (public.is_salon_member(id));
create policy salons_update on public.salons for update to authenticated
  using (public.has_salon_role(id, array['owner', 'manager']::public.salon_role[]))
  with check (public.has_salon_role(id, array['owner', 'manager']::public.salon_role[]));

select public.apply_tenant_rls('public.locations',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.location_hours',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.location_booking_settings',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);

alter table public.salon_billing_profiles enable row level security;
create policy billing_select on public.salon_billing_profiles for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));
create policy billing_write on public.salon_billing_profiles for all to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]))
  with check (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));

alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_salon_role(salon_id, array['owner']::public.salon_role[]));

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.memberships mine
      join public.memberships theirs on theirs.salon_id = mine.salon_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.user_id
    )
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[])
  );
create policy memberships_write on public.memberships for all to authenticated
  using (public.has_salon_role(salon_id, array['owner']::public.salon_role[]))
  with check (public.has_salon_role(salon_id, array['owner']::public.salon_role[]));

alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));
