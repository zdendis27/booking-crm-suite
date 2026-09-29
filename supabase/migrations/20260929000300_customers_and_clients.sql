-- Types
create type public.consent_type as enum ('marketing_email', 'marketing_sms', 'marketing_push', 'terms');
create type public.verification_channel as enum ('email', 'sms');

-- Platform settings
create table public.platform_settings (
  key text primary key,
  value jsonb not null
);
alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value) values
  ('sms_daily_budget', '300'),
  ('verification_code_ttl_min', '10'),
  ('verification_max_attempts', '5'),
  ('verification_cooldown_s', '60'),
  ('sms_per_phone_hour', '3'),
  ('sms_per_phone_day', '5'),
  ('sms_per_account_day', '5'),
  ('sms_per_ip_day', '10'),
  ('phone_changes_per_30d', '2');

create function public.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = p_key), p_default)
$$;

-- Customer accounts
create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email extensions.citext,
  email_verified_at timestamptz,
  email_is_relay boolean not null default false,
  phone text check (phone is null or phone ~ '^\+42[01][0-9]{9}$'),
  phone_verified_at timestamptz,
  first_name text,
  last_name text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.customer_accounts');
create unique index customer_accounts_verified_phone on public.customer_accounts (phone) where phone_verified_at is not null;
create index customer_accounts_email_idx on public.customer_accounts (email);

create function public.current_customer_account_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.customer_accounts where user_id = auth.uid()
$$;

create function public.sync_customer_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  v_first text := nullif(split_part(v_name, ' ', 1), '');
  v_last text := nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '');
  v_phone text := case when new.phone ~ '^\+42[01][0-9]{9}$' then new.phone else null end;
begin
  insert into public.customer_accounts (
    user_id, email, email_verified_at, email_is_relay, phone, phone_verified_at, first_name, last_name
  ) values (
    new.id, new.email, new.email_confirmed_at,
    coalesce(new.email ilike '%@privaterelay.appleid.com', false),
    v_phone, case when v_phone is not null then new.phone_confirmed_at end, v_first, v_last
  )
  on conflict (user_id) do update set
    email = excluded.email,
    email_verified_at = coalesce(excluded.email_verified_at, public.customer_accounts.email_verified_at),
    email_is_relay = excluded.email_is_relay;
  return new;
end
$$;

create trigger sync_customer_account_insert after insert on auth.users
for each row execute function public.sync_customer_account();
create trigger sync_customer_account_update after update of email, email_confirmed_at on auth.users
for each row execute function public.sync_customer_account();

create function public.guard_customer_account() returns trigger
language plpgsql as $$
begin
  if not public.is_privileged_role() then
    if new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.email_verified_at is distinct from old.email_verified_at
       or new.email_is_relay is distinct from old.email_is_relay
       or new.phone_verified_at is distinct from old.phone_verified_at then
      raise exception 'forbidden_column_change' using errcode = '42501';
    end if;
    if new.phone is distinct from old.phone then
      new.phone_verified_at := null;
    end if;
  end if;
  return new;
end
$$;

create trigger guard_customer_account before update on public.customer_accounts
for each row execute function public.guard_customer_account();

alter table public.customer_accounts enable row level security;
create policy customer_accounts_select on public.customer_accounts for select to authenticated
  using (user_id = auth.uid());
create policy customer_accounts_update on public.customer_accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  customer_account_id uuid references public.customer_accounts (id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  full_name text generated always as (btrim(first_name || ' ' || last_name)) stored,
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  email extensions.citext,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  birthday date,
  source text not null default 'admin',
  merged_into uuid references public.clients (id) on delete set null,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id)
);
select public.attach_updated_at('public.clients');
create unique index clients_account_unique on public.clients (salon_id, customer_account_id) where customer_account_id is not null and merged_into is null;
create unique index clients_phone_unique on public.clients (salon_id, phone) where phone is not null and merged_into is null and anonymized_at is null;
create index clients_salon_idx on public.clients (salon_id) where merged_into is null;
create index clients_name_trgm on public.clients using gin (full_name extensions.gin_trgm_ops);
create index clients_email_trgm on public.clients using gin (email extensions.gin_trgm_ops);

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid not null,
  author_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade
);
create index client_notes_client_idx on public.client_notes (client_id, created_at desc);

create table public.client_consents (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid not null,
  type public.consent_type not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null default 'admin',
  text_version text,
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade
);
create unique index client_consents_active on public.client_consents (client_id, type) where revoked_at is null;

create table public.client_stats (
  client_id uuid primary key,
  salon_id uuid not null references public.salons (id) on delete cascade,
  visits_count integer not null default 0,
  no_show_count integer not null default 0,
  cancelled_count integer not null default 0,
  total_spent bigint not null default 0,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  avg_interval_days numeric(7, 2),
  next_expected_at timestamptz,
  favorite_staff_id uuid,
  favorite_service_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade
);
create index client_stats_next_idx on public.client_stats (salon_id, next_expected_at);

create table public.customer_favorites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid,
  service_ids uuid[] not null default '{}',
  label text,
  created_at timestamptz not null default now(),
  unique (account_id, salon_id, staff_id, service_ids)
);

create function public.has_consent(p_client uuid, p_type public.consent_type) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_consents
    where client_id = p_client and type = p_type and revoked_at is null
  )
$$;

create function public.has_revoked_consent(p_client uuid, p_type public.consent_type) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_consents
    where client_id = p_client and type = p_type and revoked_at is not null
  ) and not exists (
    select 1 from public.client_consents
    where client_id = p_client and type = p_type and revoked_at is null
  )
$$;

create function public.anonymize_client(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.clients where id = p_client;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.clients set
    first_name = 'Anonymizovaný', last_name = 'klient', phone = null, email = null, birthday = null,
    phone_verified_at = null, email_verified_at = null, customer_account_id = null, anonymized_at = now()
  where id = p_client;
  delete from public.client_notes where client_id = p_client;
  update public.client_consents set revoked_at = coalesce(revoked_at, now()) where client_id = p_client;
  perform public.write_audit(v_salon, 'client.anonymize', 'client', p_client, null, null);
end
$$;

-- Verifications
create table public.client_verifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts (id) on delete cascade,
  channel public.verification_channel not null,
  target text not null,
  code_hash text not null,
  ip_hash text,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);
create index client_verifications_target_idx on public.client_verifications (target, created_at desc);
create index client_verifications_account_idx on public.client_verifications (account_id, created_at desc);
create index client_verifications_ip_idx on public.client_verifications (ip_hash, created_at desc);
alter table public.client_verifications enable row level security;

create function public.issue_verification(
  p_account uuid,
  p_channel public.verification_channel,
  p_target text,
  p_code_hash text,
  p_ip_hash text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_account public.customer_accounts;
  v_cooldown integer := public.setting_int('verification_cooldown_s', 60);
begin
  select * into v_account from public.customer_accounts where id = p_account;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  if p_channel = 'sms' and p_target !~ '^\+42[01][0-9]{9}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.client_verifications
    where target = p_target and created_at > now() - make_interval(secs => v_cooldown)
  ) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_channel = 'sms' then
    if (select count(*) from public.client_verifications
        where channel = 'sms' and target = p_target and created_at > now() - interval '1 hour')
       >= public.setting_int('sms_per_phone_hour', 3)
       or (select count(*) from public.client_verifications
           where channel = 'sms' and target = p_target and created_at > now() - interval '1 day')
          >= public.setting_int('sms_per_phone_day', 5)
       or (select count(*) from public.client_verifications
           where channel = 'sms' and account_id = p_account and created_at > now() - interval '1 day')
          >= public.setting_int('sms_per_account_day', 5)
       or (p_ip_hash is not null and (select count(*) from public.client_verifications
           where channel = 'sms' and ip_hash = p_ip_hash and created_at > now() - interval '1 day')
          >= public.setting_int('sms_per_ip_day', 10)) then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    if v_account.phone is distinct from p_target and (
      select count(distinct target) from public.client_verifications
      where account_id = p_account and channel = 'sms' and verified_at is not null
        and verified_at > now() - interval '30 days'
    ) >= public.setting_int('phone_changes_per_30d', 2) then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    if (select count(*) from public.client_verifications
        where channel = 'sms' and created_at > now() - interval '1 day')
       >= public.setting_int('sms_daily_budget', 300) then
      raise exception 'sms_budget_exceeded' using errcode = 'P0001';
    end if;
  else
    if (select count(*) from public.client_verifications
        where channel = 'email' and target = p_target and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  insert into public.client_verifications (account_id, channel, target, code_hash, ip_hash, expires_at)
  values (
    p_account, p_channel, p_target, p_code_hash, p_ip_hash,
    now() + make_interval(mins => public.setting_int('verification_code_ttl_min', 10))
  )
  returning id into v_id;
  return v_id;
end
$$;

create function public.confirm_verification(
  p_account uuid,
  p_channel public.verification_channel,
  p_target text,
  p_code_hash text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.client_verifications;
  v_max integer := public.setting_int('verification_max_attempts', 5);
begin
  select * into v_row from public.client_verifications
  where account_id = p_account and channel = p_channel and target = p_target
    and verified_at is null and expires_at > now()
  order by created_at desc limit 1
  for update;
  if not found then
    return false;
  end if;
  if v_row.attempts >= v_max then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  if v_row.code_hash <> p_code_hash then
    update public.client_verifications set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;
  update public.client_verifications set verified_at = now() where id = v_row.id;
  if p_channel = 'sms' then
    update public.customer_accounts set phone = p_target, phone_verified_at = now() where id = p_account;
    update public.clients set phone_verified_at = now() where customer_account_id = p_account and phone = p_target;
  else
    update public.customer_accounts set email_verified_at = now() where id = p_account and email = p_target;
    update public.clients set email_verified_at = now() where customer_account_id = p_account and email = p_target;
  end if;
  return true;
end
$$;

revoke execute on function public.issue_verification(uuid, public.verification_channel, text, text, text) from public, anon, authenticated;
revoke execute on function public.confirm_verification(uuid, public.verification_channel, text, text) from public, anon, authenticated;

-- Policies
select public.apply_tenant_rls('public.clients',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.client_notes',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.client_consents',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.client_stats',
  array['owner', 'manager', 'reception']::public.salon_role[],
  null);

create policy clients_customer_read on public.clients for select to authenticated
  using (customer_account_id = public.current_customer_account_id());

alter table public.customer_favorites enable row level security;
create policy favorites_own on public.customer_favorites for all to authenticated
  using (account_id = public.current_customer_account_id())
  with check (account_id = public.current_customer_account_id());
