-- Types
create type public.invoice_kind as enum ('invoice', 'proforma', 'credit_note');
create type public.invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');

-- Numbering
create table public.invoice_series (
  salon_id uuid not null references public.salons (id) on delete cascade,
  kind public.invoice_kind not null,
  prefix text not null check (prefix ~ '^[A-Z0-9]{0,6}$'),
  primary key (salon_id, kind)
);

create table public.invoice_counters (
  salon_id uuid not null references public.salons (id) on delete cascade,
  kind public.invoice_kind not null,
  year integer not null,
  last_number integer not null default 0,
  primary key (salon_id, kind, year)
);

create function public._next_invoice_number(p_salon uuid, p_kind public.invoice_kind, p_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_n integer;
  v_year integer := extract(year from p_date)::integer;
begin
  select prefix into v_prefix from public.invoice_series where salon_id = p_salon and kind = p_kind;
  if v_prefix is null then
    v_prefix := case p_kind when 'invoice' then 'FV' when 'proforma' then 'ZF' else 'DB' end;
  end if;
  insert into public.invoice_counters (salon_id, kind, year, last_number) values (p_salon, p_kind, v_year, 1)
  on conflict (salon_id, kind, year) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_n;
  return v_prefix || v_year::text || lpad(v_n::text, 4, '0');
end
$$;

revoke execute on function public._next_invoice_number(uuid, public.invoice_kind, date) from public, anon, authenticated;

-- Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  kind public.invoice_kind not null default 'invoice',
  status public.invoice_status not null default 'draft',
  number text,
  variable_symbol text,
  client_id uuid,
  booking_id uuid,
  related_invoice_id uuid references public.invoices (id),
  supplier jsonb,
  customer_name text not null,
  customer_ico text check (customer_ico is null or customer_ico ~ '^[0-9]{8}$'),
  customer_dic text,
  customer_street text,
  customer_city text,
  customer_zip text,
  customer_country text not null default 'CZ',
  customer_email text,
  issue_date date,
  taxable_supply_date date,
  due_date date,
  currency text not null default 'CZK',
  vat_payer boolean not null default false,
  total_net bigint not null default 0,
  total_vat bigint not null default 0,
  total_gross bigint not null default 0,
  vat_summary jsonb not null default '[]'::jsonb,
  advance_paid bigint not null default 0 check (advance_paid >= 0),
  paid_amount bigint not null default 0,
  note text,
  pdf_path text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id),
  foreign key (client_id, salon_id) references public.clients (id, salon_id),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id)
);
select public.attach_updated_at('public.invoices');
select public.attach_email_normalizer('public.invoices');
create unique index invoices_number_unique on public.invoices (salon_id, number) where number is not null;
create index invoices_salon_idx on public.invoices (salon_id, issue_date desc);
create index invoices_vs_idx on public.invoices (salon_id, variable_symbol);
create index invoices_status_idx on public.invoices (salon_id, status, due_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  invoice_id uuid not null,
  position smallint not null default 0,
  description text not null check (char_length(description) between 1 and 300),
  quantity numeric(12, 3) not null default 1 check (quantity <> 0),
  unit text not null default 'ks',
  unit_price bigint not null,
  vat_rate numeric(5, 2) not null default 0 check (vat_rate in (0, 12, 21)),
  total_gross bigint not null default 0,
  total_net bigint not null default 0,
  total_vat bigint not null default 0,
  foreign key (invoice_id, salon_id) references public.invoices (id, salon_id) on delete cascade
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  invoice_id uuid not null,
  payment_id uuid references public.payments (id),
  amount bigint not null check (amount > 0),
  paid_on date not null default current_date,
  bank_ref text,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, salon_id) references public.invoices (id, salon_id) on delete cascade
);
create unique index invoice_payments_bank_ref on public.invoice_payments (salon_id, bank_ref) where bank_ref is not null;

alter table public.payments
  add constraint payments_invoice_fk foreign key (invoice_id, salon_id) references public.invoices (id, salon_id);

-- Item totals
create function public.compute_invoice_item() returns trigger
language plpgsql as $$
begin
  new.total_gross := round(new.quantity * new.unit_price)::bigint;
  new.total_net := round(new.total_gross / (1 + new.vat_rate / 100.0))::bigint;
  new.total_vat := new.total_gross - new.total_net;
  return new;
end
$$;

create trigger compute_invoice_item before insert or update on public.invoice_items
for each row execute function public.compute_invoice_item();

create function public._invoice_is_draft(p_invoice uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invoices where id = p_invoice and status = 'draft')
$$;

create function public.guard_invoice_items() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if current_setting('app.invoice_op', true) = 'on' then
    return coalesce(new, old);
  end if;
  if not public._invoice_is_draft(v_invoice) then
    raise exception 'invoice_immutable' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end
$$;

create trigger guard_invoice_items before insert or update or delete on public.invoice_items
for each row execute function public.guard_invoice_items();

create function public.guard_invoice() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'invoice_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and current_setting('app.invoice_op', true) is distinct from 'on' then
    if new.number is distinct from old.number
       or new.kind is distinct from old.kind
       or new.issue_date is distinct from old.issue_date
       or new.taxable_supply_date is distinct from old.taxable_supply_date
       or new.due_date is distinct from old.due_date
       or new.supplier is distinct from old.supplier
       or new.customer_name is distinct from old.customer_name
       or new.customer_ico is distinct from old.customer_ico
       or new.customer_dic is distinct from old.customer_dic
       or new.customer_street is distinct from old.customer_street
       or new.customer_city is distinct from old.customer_city
       or new.customer_zip is distinct from old.customer_zip
       or new.total_net is distinct from old.total_net
       or new.total_vat is distinct from old.total_vat
       or new.total_gross is distinct from old.total_gross
       or new.vat_summary is distinct from old.vat_summary
       or new.related_invoice_id is distinct from old.related_invoice_id
       or new.status = 'draft' then
      raise exception 'invoice_immutable' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;

create trigger guard_invoice before update or delete on public.invoices
for each row execute function public.guard_invoice();

-- Totals
create function public._recompute_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_summary jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('rate', rate, 'base', base, 'vat', gross - base, 'gross', gross) order by rate), '[]'::jsonb)
  into v_summary
  from (
    select vat_rate as rate, sum(total_gross)::bigint as gross,
           round(sum(total_gross) / (1 + vat_rate / 100.0))::bigint as base
    from public.invoice_items where invoice_id = p_invoice group by vat_rate
  ) t;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set
    vat_summary = v_summary,
    total_gross = coalesce((select sum((e ->> 'gross')::bigint) from jsonb_array_elements(v_summary) e), 0),
    total_net = coalesce((select sum((e ->> 'base')::bigint) from jsonb_array_elements(v_summary) e), 0),
    total_vat = coalesce((select sum((e ->> 'vat')::bigint) from jsonb_array_elements(v_summary) e), 0)
  where id = p_invoice;
  perform set_config('app.invoice_op', 'off', true);
end
$$;

revoke execute on function public._recompute_invoice(uuid) from public, anon, authenticated;

create function public.invoice_balance(p_invoice uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select total_gross - advance_paid - paid_amount from public.invoices where id = p_invoice
$$;

revoke execute on function public.invoice_balance(uuid) from public, anon;

-- Creation
create function public._invoice_actor_check(p_salon uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(p_salon, 'invoicing') then
    raise exception 'plan_feature_invoicing' using errcode = 'P0001';
  end if;
end
$$;

revoke execute on function public._invoice_actor_check(uuid) from public, anon, authenticated;

create function public.create_invoice(
  p_salon uuid,
  p_kind public.invoice_kind,
  p_customer jsonb,
  p_items jsonb,
  p_client uuid default null,
  p_booking uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_vat_payer boolean;
begin
  perform public._invoice_actor_check(p_salon);
  if p_kind = 'credit_note' then
    raise exception 'use_credit_note' using errcode = 'P0001';
  end if;
  select coalesce(vat_payer, false) into v_vat_payer from public.salon_billing_profiles where salon_id = p_salon;
  insert into public.invoices (
    salon_id, kind, client_id, booking_id, customer_name, customer_ico, customer_dic,
    customer_street, customer_city, customer_zip, customer_country, customer_email, vat_payer, note, created_by
  ) values (
    p_salon, p_kind, p_client, p_booking,
    coalesce(p_customer ->> 'name', ''), nullif(p_customer ->> 'ico', ''), nullif(p_customer ->> 'dic', ''),
    p_customer ->> 'street', p_customer ->> 'city', p_customer ->> 'zip',
    coalesce(nullif(p_customer ->> 'country', ''), 'CZ'), nullif(p_customer ->> 'email', ''),
    coalesce(v_vat_payer, false), p_note, auth.uid()
  ) returning id into v_id;
  insert into public.invoice_items (salon_id, invoice_id, position, description, quantity, unit, unit_price, vat_rate)
  select p_salon, v_id, e.ordinality, e.value ->> 'description',
         coalesce((e.value ->> 'quantity')::numeric, 1), coalesce(e.value ->> 'unit', 'ks'),
         (e.value ->> 'unit_price')::bigint, coalesce((e.value ->> 'vat_rate')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality e(value, ordinality);
  perform public._recompute_invoice(v_id);
  return v_id;
end
$$;

create function public.create_invoice_from_booking(p_booking uuid, p_customer jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_client public.clients;
  v_customer jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_remaining bigint;
  v_count integer;
  v_i integer := 0;
  v_price bigint;
begin
  select * into v_booking from public.bookings where id = p_booking;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  perform public._invoice_actor_check(v_booking.salon_id);
  select * into v_client from public.clients where id = v_booking.client_id;
  v_customer := coalesce(p_customer, jsonb_build_object('name', v_client.full_name, 'email', v_client.email));
  select count(*) into v_count from public.booking_items where booking_id = p_booking;
  v_remaining := v_booking.discount_total;
  for v_item in select * from public.booking_items where booking_id = p_booking order by position loop
    v_i := v_i + 1;
    if v_booking.discount_total = 0 or v_booking.price_total = 0 then
      v_price := v_item.price_snap;
    elsif v_i = v_count then
      v_price := v_item.price_snap - v_remaining;
    else
      v_price := v_item.price_snap - round(v_item.price_snap * v_booking.discount_total::numeric / v_booking.price_total);
      v_remaining := v_remaining - (v_item.price_snap - v_price);
    end if;
    v_items := v_items || jsonb_build_object(
      'description', v_item.name_snap || case when v_booking.discount_total > 0 then ' (po slevě)' else '' end,
      'quantity', 1, 'unit', 'ks', 'unit_price', v_price, 'vat_rate', v_item.vat_snap
    );
  end loop;
  for v_item in select * from public.booking_products where booking_id = p_booking order by created_at loop
    v_items := v_items || jsonb_build_object(
      'description', v_item.name_snap, 'quantity', v_item.quantity, 'unit', 'ks',
      'unit_price', v_item.unit_price_snap, 'vat_rate', v_item.vat_snap
    );
  end loop;
  return public.create_invoice(v_booking.salon_id, 'invoice', v_customer, v_items, v_booking.client_id, p_booking, null);
end
$$;

create function public.issue_invoice(p_invoice uuid, p_issue_date date default current_date, p_duzp date default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_profile public.salon_billing_profiles;
  v_number text;
  v_due integer;
  v_rate_bad boolean;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;
  perform public._invoice_actor_check(v_inv.salon_id);
  if v_inv.status <> 'draft' or v_inv.kind = 'credit_note' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select * into v_profile from public.salon_billing_profiles where salon_id = v_inv.salon_id;
  if not found or coalesce(v_profile.legal_name, '') = '' or coalesce(v_profile.ico, '') = ''
     or coalesce(v_profile.address_street, '') = '' or coalesce(v_profile.address_city, '') = ''
     or coalesce(v_profile.address_zip, '') = '' then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  if v_profile.vat_payer and coalesce(v_profile.dic, '') = '' then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_items where invoice_id = p_invoice) then
    raise exception 'invoice_empty' using errcode = 'P0001';
  end if;
  if coalesce(v_inv.customer_name, '') = '' then
    raise exception 'customer_required' using errcode = 'P0001';
  end if;
  select exists (select 1 from public.invoice_items where invoice_id = p_invoice and vat_rate <> 0) into v_rate_bad;
  if not v_profile.vat_payer and v_rate_bad then
    raise exception 'vat_rate_not_allowed' using errcode = 'P0001';
  end if;
  perform public._recompute_invoice(p_invoice);
  v_number := public._next_invoice_number(v_inv.salon_id, v_inv.kind, p_issue_date);
  v_due := v_profile.default_due_days;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set
    status = 'issued',
    number = v_number,
    variable_symbol = regexp_replace(v_number, '\D', '', 'g'),
    issue_date = p_issue_date,
    taxable_supply_date = case when v_inv.kind = 'proforma' then null else coalesce(p_duzp, p_issue_date) end,
    due_date = p_issue_date + v_due,
    vat_payer = v_profile.vat_payer,
    supplier = jsonb_build_object(
      'name', v_profile.legal_name, 'ico', v_profile.ico, 'dic', v_profile.dic, 'vat_payer', v_profile.vat_payer,
      'street', v_profile.address_street, 'city', v_profile.address_city, 'zip', v_profile.address_zip,
      'country', v_profile.country, 'iban', v_profile.iban, 'bank_account', v_profile.bank_account,
      'swift', v_profile.swift, 'note', v_profile.invoice_note
    ),
    advance_paid = coalesce((
      select paid_amount from public.invoices where id = v_inv.related_invoice_id and kind = 'proforma'
    ), 0)
  where id = p_invoice;
  update public.invoices set status = 'paid'
  where id = p_invoice and total_gross - advance_paid - paid_amount <= 0 and total_gross > 0;
  perform set_config('app.invoice_op', 'off', true);
  perform public.write_audit(v_inv.salon_id, 'invoice.issue', 'invoice', p_invoice, null, jsonb_build_object('number', v_number));
  return v_number;
end
$$;

create function public.convert_proforma(p_proforma uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pro public.invoices;
  v_id uuid;
begin
  select * into v_pro from public.invoices where id = p_proforma;
  if not found or v_pro.kind <> 'proforma' or v_pro.status = 'draft' or v_pro.status = 'cancelled' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  perform public._invoice_actor_check(v_pro.salon_id);
  insert into public.invoices (
    salon_id, kind, client_id, booking_id, related_invoice_id, customer_name, customer_ico, customer_dic,
    customer_street, customer_city, customer_zip, customer_country, customer_email, vat_payer, note, created_by
  ) values (
    v_pro.salon_id, 'invoice', v_pro.client_id, v_pro.booking_id, p_proforma, v_pro.customer_name, v_pro.customer_ico,
    v_pro.customer_dic, v_pro.customer_street, v_pro.customer_city, v_pro.customer_zip, v_pro.customer_country,
    v_pro.customer_email, v_pro.vat_payer, v_pro.note, auth.uid()
  ) returning id into v_id;
  insert into public.invoice_items (salon_id, invoice_id, position, description, quantity, unit, unit_price, vat_rate)
  select salon_id, v_id, position, description, quantity, unit, unit_price, vat_rate
  from public.invoice_items where invoice_id = p_proforma;
  perform public._recompute_invoice(v_id);
  return v_id;
end
$$;

-- Payments
create function public.record_invoice_payment(
  p_invoice uuid,
  p_amount bigint,
  p_method public.payment_method,
  p_paid_on date default current_date,
  p_bank_ref text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_payment uuid;
  v_balance bigint;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;
  perform public._invoice_actor_check(v_inv.salon_id);
  if v_inv.status not in ('issued', 'partially_paid') or v_inv.kind = 'credit_note' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_method in ('voucher', 'online') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  v_balance := v_inv.total_gross - v_inv.advance_paid - v_inv.paid_amount;
  if p_amount <= 0 or p_amount > v_balance then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.payments (salon_id, booking_id, client_id, invoice_id, kind, method, amount, paid_at, note, recorded_by)
  values (
    v_inv.salon_id, v_inv.booking_id, v_inv.client_id, p_invoice, 'payment', p_method, p_amount,
    p_paid_on::timestamptz, 'Faktura ' || v_inv.number, auth.uid()
  ) returning id into v_payment;
  insert into public.invoice_payments (salon_id, invoice_id, payment_id, amount, paid_on, bank_ref)
  values (v_inv.salon_id, p_invoice, v_payment, p_amount, p_paid_on, p_bank_ref);
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set
    paid_amount = paid_amount + p_amount,
    status = case when v_balance - p_amount = 0 then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
  where id = p_invoice;
  perform set_config('app.invoice_op', 'off', true);
  return v_payment;
end
$$;

create function public.match_bank_payment(
  p_salon uuid, p_variable_symbol text, p_amount bigint, p_date date, p_ref text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
begin
  perform public._invoice_actor_check(p_salon);
  if p_ref is not null and exists (select 1 from public.invoice_payments where salon_id = p_salon and bank_ref = p_ref) then
    return null;
  end if;
  select * into v_inv from public.invoices
  where salon_id = p_salon and variable_symbol = p_variable_symbol and kind in ('invoice', 'proforma')
    and status in ('issued', 'partially_paid')
    and total_gross - advance_paid - paid_amount >= p_amount
  order by issue_date desc limit 1;
  if not found then
    return null;
  end if;
  perform public.record_invoice_payment(v_inv.id, p_amount, 'bank_transfer', p_date, p_ref);
  return v_inv.id;
end
$$;

-- Credit notes
create function public.create_credit_note(p_invoice uuid, p_reason text, p_items jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_id uuid;
  v_number text;
  v_credited bigint;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found or v_inv.kind <> 'invoice' or v_inv.status not in ('issued', 'partially_paid', 'paid') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  perform public._invoice_actor_check(v_inv.salon_id);
  insert into public.invoices (
    salon_id, kind, client_id, booking_id, related_invoice_id, customer_name, customer_ico, customer_dic,
    customer_street, customer_city, customer_zip, customer_country, customer_email, vat_payer, note, created_by
  ) values (
    v_inv.salon_id, 'credit_note', v_inv.client_id, v_inv.booking_id, p_invoice, v_inv.customer_name, v_inv.customer_ico,
    v_inv.customer_dic, v_inv.customer_street, v_inv.customer_city, v_inv.customer_zip, v_inv.customer_country,
    v_inv.customer_email, v_inv.vat_payer, p_reason, auth.uid()
  ) returning id into v_id;
  if p_items is null then
    insert into public.invoice_items (salon_id, invoice_id, position, description, quantity, unit, unit_price, vat_rate)
    select salon_id, v_id, position, description, -quantity, unit, unit_price, vat_rate
    from public.invoice_items where invoice_id = p_invoice;
  else
    insert into public.invoice_items (salon_id, invoice_id, position, description, quantity, unit, unit_price, vat_rate)
    select v_inv.salon_id, v_id, e.ordinality, e.value ->> 'description',
           -abs(coalesce((e.value ->> 'quantity')::numeric, 1)), coalesce(e.value ->> 'unit', 'ks'),
           (e.value ->> 'unit_price')::bigint, coalesce((e.value ->> 'vat_rate')::numeric, 0)
    from jsonb_array_elements(p_items) with ordinality e(value, ordinality);
  end if;
  perform public._recompute_invoice(v_id);
  select -coalesce(sum(total_gross), 0) into v_credited
  from public.invoices where related_invoice_id = p_invoice and kind = 'credit_note' and status <> 'draft';
  if v_credited + (select -total_gross from public.invoices where id = v_id) > v_inv.total_gross then
    raise exception 'credit_exceeds_invoice' using errcode = 'P0001';
  end if;
  v_number := public._next_invoice_number(v_inv.salon_id, 'credit_note', current_date);
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set
    status = 'issued', number = v_number, variable_symbol = regexp_replace(v_number, '\D', '', 'g'),
    issue_date = current_date, taxable_supply_date = current_date, due_date = current_date,
    supplier = v_inv.supplier
  where id = v_id;
  if v_credited + (select -total_gross from public.invoices where id = v_id) = v_inv.total_gross then
    update public.invoices set status = 'cancelled' where id = p_invoice;
  end if;
  perform set_config('app.invoice_op', 'off', true);
  perform public.write_audit(v_inv.salon_id, 'invoice.credit_note', 'invoice', p_invoice, null,
    jsonb_build_object('credit_note', v_id, 'reason', p_reason));
  return v_id;
end
$$;

-- QR payment and exports
create function public.invoice_spayd(p_invoice uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_iban text;
  v_balance bigint;
  v_msg text;
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if not found or not public.has_salon_role(v_inv.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    return null;
  end if;
  v_iban := upper(replace(coalesce(v_inv.supplier ->> 'iban', ''), ' ', ''));
  v_balance := v_inv.total_gross - v_inv.advance_paid - v_inv.paid_amount;
  if v_iban = '' or v_inv.kind = 'credit_note' or v_balance <= 0 or v_inv.currency <> 'CZK' then
    return null;
  end if;
  v_msg := left(regexp_replace(coalesce(v_inv.number, ''), '[*]', '', 'g'), 60);
  return 'SPD*1.0*ACC:' || v_iban
    || '*AM:' || to_char(v_balance / 100.0, 'FM999999990.00')
    || '*CC:CZK*X-VS:' || coalesce(v_inv.variable_symbol, '')
    || '*MSG:' || upper(v_msg);
end
$$;

create function public.export_invoices(p_salon uuid, p_from date, p_to date)
returns table (
  number text, kind public.invoice_kind, status public.invoice_status, issue_date date, taxable_supply_date date,
  due_date date, customer_name text, customer_ico text, customer_dic text, total_net bigint, total_vat bigint,
  total_gross bigint, paid_amount bigint, vat_summary jsonb, variable_symbol text
)
language sql stable security definer set search_path = '' as $$
  select i.number, i.kind, i.status, i.issue_date, i.taxable_supply_date, i.due_date, i.customer_name, i.customer_ico,
         i.customer_dic, i.total_net, i.total_vat, i.total_gross, i.paid_amount, i.vat_summary, i.variable_symbol
  from public.invoices i
  where i.salon_id = p_salon and i.status <> 'draft' and i.issue_date between p_from and p_to
    and public.has_salon_role(p_salon, array['owner', 'manager']::public.salon_role[])
  order by i.issue_date, i.number
$$;

create function public.overdue_invoices(p_salon uuid)
returns table (id uuid, number text, customer_name text, due_date date, balance bigint, days_overdue integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.number, i.customer_name, i.due_date, i.total_gross - i.advance_paid - i.paid_amount,
         (current_date - i.due_date)::int
  from public.invoices i
  where i.salon_id = p_salon and i.kind = 'invoice' and i.status in ('issued', 'partially_paid')
    and i.due_date < current_date
    and public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[])
  order by i.due_date
$$;

revoke execute on function public.create_invoice(uuid, public.invoice_kind, jsonb, jsonb, uuid, uuid, text) from public, anon;
revoke execute on function public.create_invoice_from_booking(uuid, jsonb) from public, anon;
revoke execute on function public.issue_invoice(uuid, date, date) from public, anon;
revoke execute on function public.convert_proforma(uuid) from public, anon;
revoke execute on function public.record_invoice_payment(uuid, bigint, public.payment_method, date, text) from public, anon;
revoke execute on function public.match_bank_payment(uuid, text, bigint, date, text) from public, anon;
revoke execute on function public.create_credit_note(uuid, text, jsonb) from public, anon;
revoke execute on function public.invoice_spayd(uuid) from public, anon;
revoke execute on function public.export_invoices(uuid, date, date) from public, anon;
revoke execute on function public.overdue_invoices(uuid) from public, anon;

-- Policies
alter table public.invoice_series enable row level security;
create policy invoice_series_read on public.invoice_series for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));
create policy invoice_series_write on public.invoice_series for all to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]))
  with check (public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));

alter table public.invoice_counters enable row level security;

alter table public.invoices enable row level security;
create policy invoices_select on public.invoices for select to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (status = 'draft' and public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy invoices_update on public.invoices for update to authenticated
  using (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]))
  with check (public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));
create policy invoices_delete on public.invoices for delete to authenticated
  using (status = 'draft' and public.has_salon_role(salon_id, array['owner', 'manager', 'reception']::public.salon_role[]));

select public.apply_tenant_rls('public.invoice_items',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager', 'reception']::public.salon_role[]);
select public.apply_tenant_rls('public.invoice_payments',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
