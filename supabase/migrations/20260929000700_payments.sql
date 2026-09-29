-- Types
create type public.payment_method as enum ('card', 'cash', 'qr', 'bank_transfer', 'online', 'voucher', 'other');
create type public.payment_status as enum ('pending', 'succeeded', 'failed');
create type public.payment_kind as enum ('payment', 'deposit', 'tip', 'refund');

-- Stripe accounts
create table public.stripe_accounts (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.stripe_accounts');

-- Deposit policy
create table public.deposit_policies (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'percent' check (mode in ('percent', 'fixed')),
  value bigint not null default 20 check (value > 0),
  only_new_clients boolean not null default true,
  min_total bigint not null default 0 check (min_total >= 0),
  refundable_until_h integer not null default 24 check (refundable_until_h >= 0),
  updated_at timestamptz not null default now(),
  check (mode <> 'percent' or value <= 100)
);
select public.attach_updated_at('public.deposit_policies');

create or replace function public._deposit_required(p_salon uuid, p_client uuid, p_total bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_policy public.deposit_policies;
  v_amount bigint;
begin
  select * into v_policy from public.deposit_policies where salon_id = p_salon and enabled;
  if not found or not public.plan_has_feature(p_salon, 'deposits') then
    return 0;
  end if;
  if not exists (
    select 1 from public.stripe_accounts where salon_id = p_salon and charges_enabled
  ) then
    return 0;
  end if;
  if p_total < v_policy.min_total or p_total <= 0 then
    return 0;
  end if;
  if v_policy.only_new_clients and exists (
    select 1 from public.bookings where client_id = p_client and status = 'completed'
  ) then
    return 0;
  end if;
  v_amount := case v_policy.mode
    when 'percent' then round(p_total * v_policy.value / 100.0)
    else least(v_policy.value, p_total)
  end;
  return greatest(v_amount, 0);
end
$$;

-- Cash register
create table public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid not null,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  opening_float bigint not null default 0 check (opening_float >= 0),
  closed_by uuid,
  closed_at timestamptz,
  counted_cash bigint,
  expected_cash bigint,
  note text,
  unique (id, salon_id),
  foreign key (location_id, salon_id) references public.locations (id, salon_id)
);
create unique index cash_one_open_session on public.cash_register_sessions (location_id) where closed_at is null;

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid,
  booking_id uuid,
  client_id uuid,
  invoice_id uuid,
  voucher_id uuid,
  refund_of uuid references public.payments (id),
  kind public.payment_kind not null default 'payment',
  method public.payment_method not null,
  status public.payment_status not null default 'succeeded',
  amount bigint not null check (amount <> 0),
  currency text not null default 'CZK',
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  cash_session_id uuid,
  note text,
  paid_at timestamptz not null default now(),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id),
  foreign key (client_id, salon_id) references public.clients (id, salon_id),
  foreign key (cash_session_id, salon_id) references public.cash_register_sessions (id, salon_id),
  check ((kind = 'refund' and amount < 0) or (kind <> 'refund' and amount > 0))
);
create index payments_salon_paid_idx on public.payments (salon_id, paid_at desc);
create index payments_booking_idx on public.payments (booking_id);
create index payments_client_idx on public.payments (client_id);

create function public.booking_balance(p_booking uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select b.price_total + b.products_total - b.discount_total - coalesce((
    select sum(p.amount) from public.payments p
    where p.booking_id = b.id and p.status = 'succeeded' and p.kind in ('payment', 'deposit', 'refund')
  ), 0)
  from public.bookings b where b.id = p_booking
$$;

revoke execute on function public.booking_balance(uuid) from public, anon;

create function public._open_cash_session(p_location uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.cash_register_sessions where location_id = p_location and closed_at is null
$$;

create function public.record_payment(
  p_booking uuid,
  p_amount bigint,
  p_method public.payment_method,
  p_tip bigint default 0,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_id uuid;
  v_session uuid;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method in ('voucher', 'online') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if p_amount <= 0 or p_tip < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('confirmed', 'completed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_amount > public.booking_balance(p_booking) then
    raise exception 'overpayment' using errcode = 'P0001';
  end if;
  v_session := case when p_method = 'cash' then public._open_cash_session(v_booking.location_id) end;
  insert into public.payments (
    salon_id, location_id, booking_id, client_id, kind, method, amount, cash_session_id, note, recorded_by
  ) values (
    v_booking.salon_id, v_booking.location_id, p_booking, v_booking.client_id, 'payment', p_method, p_amount,
    v_session, p_note, auth.uid()
  ) returning id into v_id;
  if p_tip > 0 then
    insert into public.payments (
      salon_id, location_id, booking_id, client_id, kind, method, amount, cash_session_id, recorded_by
    ) values (
      v_booking.salon_id, v_booking.location_id, p_booking, v_booking.client_id, 'tip', p_method, p_tip,
      v_session, auth.uid()
    );
  end if;
  return v_id;
end
$$;

create function public.refund_payment(p_payment uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.payments;
  v_refunded bigint;
  v_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment for update;
  if not found or v_payment.kind = 'refund' then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_payment.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(-sum(amount), 0) into v_refunded from public.payments where refund_of = p_payment;
  if p_amount <= 0 or p_amount > v_payment.amount - v_refunded then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.payments (
    salon_id, location_id, booking_id, client_id, refund_of, kind, method, amount, cash_session_id, note, recorded_by
  ) values (
    v_payment.salon_id, v_payment.location_id, v_payment.booking_id, v_payment.client_id, p_payment, 'refund',
    v_payment.method, -p_amount,
    case when v_payment.method = 'cash' then public._open_cash_session(v_payment.location_id) end,
    p_reason, auth.uid()
  ) returning id into v_id;
  perform public.write_audit(v_payment.salon_id, 'payment.refund', 'payment', p_payment, null,
    jsonb_build_object('amount', p_amount, 'reason', p_reason));
  return v_id;
end
$$;

create function public.record_stripe_payment(
  p_salon uuid,
  p_booking uuid,
  p_amount bigint,
  p_payment_intent text,
  p_kind public.payment_kind default 'payment',
  p_charge text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking and salon_id = p_salon for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  insert into public.payments (
    salon_id, location_id, booking_id, client_id, kind, method, amount, stripe_payment_intent_id, stripe_charge_id
  ) values (
    p_salon, v_booking.location_id, p_booking, v_booking.client_id, p_kind, 'online', p_amount, p_payment_intent, p_charge
  )
  on conflict (stripe_payment_intent_id) do nothing
  returning id into v_id;
  if v_id is not null and p_kind = 'deposit' and v_booking.status = 'pending' then
    update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null where id = p_booking;
  end if;
  return v_id;
end
$$;

revoke execute on function public.record_payment(uuid, bigint, public.payment_method, bigint, text) from public, anon;
revoke execute on function public.refund_payment(uuid, bigint, text) from public, anon;
revoke execute on function public.record_stripe_payment(uuid, uuid, bigint, text, public.payment_kind, text) from public, anon, authenticated;
revoke execute on function public._open_cash_session(uuid) from public, anon, authenticated;

-- Cash sessions API
create function public.open_cash_session(p_location uuid, p_float bigint default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
  v_id uuid;
begin
  select salon_id into v_salon from public.locations where id = p_location;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if public._open_cash_session(p_location) is not null then
    raise exception 'session_already_open' using errcode = 'P0001';
  end if;
  insert into public.cash_register_sessions (salon_id, location_id, opened_by, opening_float)
  values (v_salon, p_location, auth.uid(), p_float) returning id into v_id;
  return v_id;
end
$$;

create function public.close_cash_session(p_session uuid, p_counted bigint, p_note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.cash_register_sessions;
  v_expected bigint;
begin
  select * into v_session from public.cash_register_sessions where id = p_session for update;
  if not found or not public.has_salon_role(v_session.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_session.closed_at is not null then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;
  select v_session.opening_float + coalesce(sum(amount), 0) into v_expected
  from public.payments where cash_session_id = p_session and method = 'cash' and status = 'succeeded';
  update public.cash_register_sessions
  set closed_at = now(), closed_by = auth.uid(), counted_cash = p_counted, expected_cash = v_expected, note = p_note
  where id = p_session;
  return p_counted - v_expected;
end
$$;

revoke execute on function public.open_cash_session(uuid, bigint) from public, anon;
revoke execute on function public.close_cash_session(uuid, bigint, text) from public, anon;

-- Vouchers
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  code text not null,
  initial_amount bigint not null check (initial_amount > 0),
  balance bigint not null check (balance >= 0),
  service_id uuid,
  buyer_client_id uuid,
  recipient_name text,
  recipient_email text,
  message text,
  source text not null default 'admin' check (source in ('admin', 'online')),
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (salon_id, code),
  unique (id, salon_id),
  foreign key (service_id, salon_id) references public.services (id, salon_id),
  foreign key (buyer_client_id, salon_id) references public.clients (id, salon_id)
);

create table public.voucher_transactions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  voucher_id uuid not null,
  kind text not null check (kind in ('issue', 'redeem', 'refund', 'adjust')),
  amount bigint not null,
  booking_id uuid,
  payment_id uuid references public.payments (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (voucher_id, salon_id) references public.vouchers (id, salon_id) on delete cascade
);
create index voucher_transactions_voucher_idx on public.voucher_transactions (voucher_id, created_at);

alter table public.payments
  add constraint payments_voucher_fk foreign key (voucher_id, salon_id) references public.vouchers (id, salon_id);

create function public._voucher_code() returns text
language sql volatile set search_path = '' as $$
  select upper(substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4))
  from (select replace(gen_random_uuid()::text, '-', '') as s) t
$$;

create function public._issue_voucher(
  p_salon uuid,
  p_amount bigint,
  p_service uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_message text,
  p_source text,
  p_expires timestamptz,
  p_buyer uuid,
  p_created_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.vouchers (
    salon_id, code, initial_amount, balance, service_id, buyer_client_id, recipient_name, recipient_email,
    message, source, expires_at, created_by
  ) values (
    p_salon, public._voucher_code(), p_amount, p_amount, p_service, p_buyer, p_recipient_name, p_recipient_email,
    p_message, p_source, p_expires, p_created_by
  ) returning id into v_id;
  insert into public.voucher_transactions (salon_id, voucher_id, kind, amount, created_by)
  values (p_salon, v_id, 'issue', p_amount, p_created_by);
  return v_id;
end
$$;

create function public.issue_voucher(
  p_salon uuid,
  p_amount bigint,
  p_service uuid default null,
  p_recipient_name text default null,
  p_recipient_email text default null,
  p_message text default null,
  p_expires timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(p_salon, 'vouchers') then
    raise exception 'plan_feature_vouchers' using errcode = 'P0001';
  end if;
  return public._issue_voucher(
    p_salon, p_amount, p_service, p_recipient_name, p_recipient_email, p_message, 'admin',
    coalesce(p_expires, now() + interval '12 months'), null, auth.uid()
  );
end
$$;

create function public.issue_paid_voucher(
  p_salon uuid,
  p_amount bigint,
  p_payment_intent text,
  p_service uuid default null,
  p_recipient_name text default null,
  p_recipient_email text default null,
  p_message text default null,
  p_buyer uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := public._issue_voucher(
    p_salon, p_amount, p_service, p_recipient_name, p_recipient_email, p_message, 'online',
    now() + interval '12 months', p_buyer, null
  );
  insert into public.payments (salon_id, voucher_id, client_id, kind, method, amount, stripe_payment_intent_id, note)
  values (p_salon, v_id, p_buyer, 'payment', 'online', p_amount, p_payment_intent, 'Prodej poukazu')
  on conflict (stripe_payment_intent_id) do nothing;
  return v_id;
end
$$;

create function public.redeem_voucher(p_salon uuid, p_code text, p_amount bigint, p_booking uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_voucher public.vouchers;
  v_booking public.bookings;
  v_payment uuid;
begin
  if not public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_voucher from public.vouchers where salon_id = p_salon and code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'voucher_not_found' using errcode = 'P0001';
  end if;
  if v_voucher.status <> 'active' or (v_voucher.expires_at is not null and v_voucher.expires_at < now()) then
    raise exception 'voucher_unavailable' using errcode = 'P0001';
  end if;
  if p_amount <= 0 or p_amount > v_voucher.balance then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if p_booking is not null then
    select * into v_booking from public.bookings where id = p_booking and salon_id = p_salon for update;
    if not found then
      raise exception 'booking_not_found' using errcode = 'P0001';
    end if;
    if p_amount > public.booking_balance(p_booking) then
      raise exception 'overpayment' using errcode = 'P0001';
    end if;
  end if;
  insert into public.payments (salon_id, location_id, booking_id, client_id, voucher_id, kind, method, amount, recorded_by)
  values (p_salon, v_booking.location_id, p_booking, v_booking.client_id, v_voucher.id, 'payment', 'voucher', p_amount, auth.uid())
  returning id into v_payment;
  update public.vouchers
  set balance = balance - p_amount, status = case when balance - p_amount = 0 then 'used' else status end
  where id = v_voucher.id;
  insert into public.voucher_transactions (salon_id, voucher_id, kind, amount, booking_id, payment_id, created_by)
  values (p_salon, v_voucher.id, 'redeem', -p_amount, p_booking, v_payment, auth.uid());
  return v_payment;
end
$$;

create function public.lookup_voucher(p_salon uuid, p_code text)
returns table (id uuid, code text, balance bigint, status text, expires_at timestamptz, service_id uuid)
language sql stable security definer set search_path = '' as $$
  select v.id, v.code, v.balance, v.status, v.expires_at, v.service_id
  from public.vouchers v
  where v.salon_id = p_salon and v.code = upper(trim(p_code))
    and public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[])
$$;

create function public.expire_vouchers() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.vouchers set status = 'expired'
    where status = 'active' and expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end
$$;

revoke execute on function public._voucher_code() from public, anon, authenticated;
revoke execute on function public._issue_voucher(uuid, bigint, uuid, text, text, text, text, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.issue_voucher(uuid, bigint, uuid, text, text, text, timestamptz) from public, anon;
revoke execute on function public.issue_paid_voucher(uuid, bigint, text, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.redeem_voucher(uuid, text, bigint, uuid) from public, anon;
revoke execute on function public.lookup_voucher(uuid, text) from public, anon;
revoke execute on function public.expire_vouchers() from public, anon, authenticated;

select public.attach_email_normalizer('public.vouchers');

-- Promo codes
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  code text not null,
  type text not null check (type in ('percent', 'fixed')),
  value bigint not null check (value > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  service_ids uuid[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (salon_id, code),
  check (type <> 'percent' or value <= 100)
);

create function public.apply_promo(p_booking uuid, p_code text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_promo public.promo_codes;
  v_base bigint;
  v_discount bigint;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  if not found or not public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_promo from public.promo_codes
  where salon_id = v_booking.salon_id and code = upper(trim(p_code)) for update;
  if not found or not v_promo.active
     or (v_promo.valid_from is not null and v_promo.valid_from > now())
     or (v_promo.valid_to is not null and v_promo.valid_to < now())
     or (v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses) then
    raise exception 'promo_unavailable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_adjustments where booking_id = p_booking and kind = 'promo') then
    raise exception 'promo_already_applied' using errcode = 'P0001';
  end if;
  select coalesce(sum(price_snap), 0) into v_base from public.booking_items
  where booking_id = p_booking and (v_promo.service_ids is null or service_id = any (v_promo.service_ids));
  if v_base = 0 then
    raise exception 'promo_not_applicable' using errcode = 'P0001';
  end if;
  v_discount := case v_promo.type when 'percent' then round(v_base * v_promo.value / 100.0) else least(v_base, v_promo.value) end;
  if v_discount + v_booking.discount_total > v_booking.price_total then
    v_discount := v_booking.price_total - v_booking.discount_total;
  end if;
  insert into public.booking_adjustments (salon_id, booking_id, kind, label, amount, ref_id, created_by)
  values (v_booking.salon_id, p_booking, 'promo', 'Promo kód ' || v_promo.code, -v_discount, v_promo.id, auth.uid());
  update public.promo_codes set used_count = used_count + 1 where id = v_promo.id;
  return v_discount;
end
$$;

revoke execute on function public.apply_promo(uuid, text) from public, anon;

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  location_id uuid,
  supplier_id uuid,
  category text not null default 'ostatni',
  description text not null,
  amount bigint not null check (amount > 0),
  vat_amount bigint not null default 0 check (vat_amount >= 0),
  method public.payment_method not null default 'card',
  incurred_on date not null default current_date,
  receipt_path text,
  cash_session_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (location_id, salon_id) references public.locations (id, salon_id),
  foreign key (cash_session_id, salon_id) references public.cash_register_sessions (id, salon_id)
);
create index expenses_salon_date_idx on public.expenses (salon_id, incurred_on desc);

-- Policies
select public.apply_tenant_rls('public.stripe_accounts',
  array['owner', 'manager']::public.salon_role[], null);
select public.apply_tenant_rls('public.deposit_policies',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.cash_register_sessions',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.payments',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.vouchers',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.voucher_transactions',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.promo_codes',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.expenses',
  array['owner', 'manager']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);

create policy payments_customer_read on public.payments for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = payments.client_id and c.customer_account_id = public.current_customer_account_id()
  ));
