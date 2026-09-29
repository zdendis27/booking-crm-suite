-- Types
create type public.stock_movement_kind as enum ('purchase', 'sale', 'adjustment', 'return', 'waste');
create type public.commission_type as enum ('percent', 'fixed', 'none');
create type public.commission_scope as enum ('all', 'category', 'service', 'product');

-- Suppliers and products
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, salon_id)
);

alter table public.expenses
  add constraint expenses_supplier_fk foreign key (supplier_id, salon_id) references public.suppliers (id, salon_id);

select public.attach_email_normalizer('public.suppliers');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sku text,
  barcode text,
  category text,
  unit text not null default 'ks',
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  sale_price bigint not null default 0 check (sale_price >= 0),
  vat_rate numeric(5, 2) not null default 0 check (vat_rate in (0, 12, 21)),
  stock integer not null default 0,
  min_stock integer not null default 0 check (min_stock >= 0),
  sellable boolean not null default true,
  supplier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, salon_id),
  foreign key (supplier_id, salon_id) references public.suppliers (id, salon_id)
);
select public.attach_updated_at('public.products');
create index products_salon_idx on public.products (salon_id) where archived_at is null;
create unique index products_sku_unique on public.products (salon_id, sku) where sku is not null and archived_at is null;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  supplier_id uuid,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'received', 'cancelled')),
  ordered_at timestamptz,
  received_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, salon_id),
  foreign key (supplier_id, salon_id) references public.suppliers (id, salon_id)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  purchase_order_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  foreign key (purchase_order_id, salon_id) references public.purchase_orders (id, salon_id) on delete cascade,
  foreign key (product_id, salon_id) references public.products (id, salon_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  product_id uuid not null,
  kind public.stock_movement_kind not null,
  quantity integer not null check (quantity <> 0),
  unit_cost bigint,
  booking_id uuid,
  supplier_id uuid,
  purchase_order_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (product_id, salon_id) references public.products (id, salon_id)
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create table public.booking_products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null,
  product_id uuid not null,
  staff_id uuid,
  quantity integer not null check (quantity > 0),
  unit_price_snap bigint not null,
  vat_snap numeric(5, 2) not null default 0,
  name_snap text not null,
  created_at timestamptz not null default now(),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id) on delete cascade,
  foreign key (product_id, salon_id) references public.products (id, salon_id)
);
create index booking_products_booking_idx on public.booking_products (booking_id);

create function public._notify_managers(p_salon uuid, p_type text, p_payload jsonb, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in select user_id from public.memberships where salon_id = p_salon and role in ('owner', 'manager') loop
    insert into public.notifications (salon_id, user_id, channel, type, payload, status, sent_at, dedupe_key)
    values (p_salon, v_user, 'in_app', p_type, p_payload, 'sent', now(), p_dedupe || ':in_app:' || v_user)
    on conflict (dedupe_key) do nothing;
    if exists (select 1 from public.push_subscriptions where user_id = v_user and disabled_at is null) then
      insert into public.notifications (salon_id, user_id, channel, type, payload, dedupe_key)
      values (p_salon, v_user, 'push', p_type, p_payload, p_dedupe || ':push:' || v_user)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end
$$;

revoke execute on function public._notify_managers(uuid, text, jsonb, text) from public, anon, authenticated;

create function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_new integer;
begin
  select * into v_product from public.products where id = new.product_id for update;
  v_new := v_product.stock + new.quantity;
  if v_new < 0 and new.kind in ('sale', 'waste') then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
  update public.products set stock = v_new where id = new.product_id;
  if v_new <= v_product.min_stock and v_product.stock > v_product.min_stock then
    perform public._notify_managers(
      new.salon_id, 'low_stock',
      jsonb_build_object('product_id', v_product.id, 'name', v_product.name, 'stock', v_new, 'min_stock', v_product.min_stock),
      'lowstock:' || v_product.id || ':' || extract(epoch from now())::bigint
    );
  end if;
  return new;
end
$$;

create trigger apply_stock_movement after insert on public.stock_movements
for each row execute function public.apply_stock_movement();

create function public.adjust_stock(p_product uuid, p_quantity integer, p_kind public.stock_movement_kind, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.products where id = p_product;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(v_salon, 'inventory') then
    raise exception 'plan_feature_inventory' using errcode = 'P0001';
  end if;
  if p_kind not in ('adjustment', 'waste', 'purchase') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  insert into public.stock_movements (salon_id, product_id, kind, quantity, note, created_by)
  values (v_salon, p_product, p_kind, case when p_kind = 'waste' then -abs(p_quantity) else p_quantity end, p_note, auth.uid());
end
$$;

create function public.add_booking_product(p_booking uuid, p_product uuid, p_quantity integer, p_staff uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_product public.products;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  select * into v_product from public.products where id = p_product;
  if v_booking.id is null or v_product.id is null or v_booking.salon_id <> v_product.salon_id then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(v_booking.salon_id, 'inventory') then
    raise exception 'plan_feature_inventory' using errcode = 'P0001';
  end if;
  if v_product.archived_at is not null or not v_product.sellable or p_quantity <= 0 then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('pending', 'confirmed', 'completed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  insert into public.stock_movements (salon_id, product_id, kind, quantity, unit_cost, booking_id, created_by)
  values (v_booking.salon_id, p_product, 'sale', -p_quantity, v_product.purchase_price, p_booking, auth.uid());
  insert into public.booking_products (salon_id, booking_id, product_id, staff_id, quantity, unit_price_snap, vat_snap, name_snap)
  values (v_booking.salon_id, p_booking, p_product, coalesce(p_staff, v_booking.primary_staff_id), p_quantity,
          v_product.sale_price, v_product.vat_rate, v_product.name)
  returning id into v_id;
  update public.bookings set products_total = products_total + p_quantity * v_product.sale_price where id = p_booking;
  if v_booking.status = 'completed' then
    perform public._compute_commissions(p_booking);
    perform public.refresh_client_stats(v_booking.client_id);
  end if;
  return v_id;
end
$$;

create function public.remove_booking_product(p_line uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.booking_products;
  v_booking public.bookings;
begin
  select * into v_line from public.booking_products where id = p_line for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into v_booking from public.bookings where id = v_line.booking_id for update;
  if not public.has_salon_role(v_line.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.stock_movements (salon_id, product_id, kind, quantity, booking_id, created_by)
  values (v_line.salon_id, v_line.product_id, 'return', v_line.quantity, v_line.booking_id, auth.uid());
  update public.bookings set products_total = greatest(products_total - v_line.quantity * v_line.unit_price_snap, 0)
  where id = v_line.booking_id;
  delete from public.booking_products where id = p_line;
  if v_booking.status = 'completed' then
    perform public._compute_commissions(v_line.booking_id);
    perform public.refresh_client_stats(v_booking.client_id);
  end if;
end
$$;

create function public.create_purchase_order(p_salon uuid, p_supplier uuid, p_items jsonb, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.has_salon_role(p_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(p_salon, 'inventory') then
    raise exception 'plan_feature_inventory' using errcode = 'P0001';
  end if;
  insert into public.purchase_orders (salon_id, supplier_id, status, ordered_at, note, created_by)
  values (p_salon, p_supplier, 'ordered', now(), p_note, auth.uid()) returning id into v_id;
  insert into public.purchase_order_items (salon_id, purchase_order_id, product_id, quantity, unit_cost)
  select p_salon, v_id, (e ->> 'product_id')::uuid, (e ->> 'quantity')::int, (e ->> 'unit_cost')::bigint
  from jsonb_array_elements(p_items) e;
  return v_id;
end
$$;

create function public.receive_purchase_order(p_order uuid, p_create_expense boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders;
  v_total bigint;
begin
  select * into v_order from public.purchase_orders where id = p_order for update;
  if not found or not public.has_salon_role(v_order.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_order.status not in ('draft', 'ordered') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  insert into public.stock_movements (salon_id, product_id, kind, quantity, unit_cost, supplier_id, purchase_order_id, created_by)
  select salon_id, product_id, 'purchase', quantity, unit_cost, v_order.supplier_id, p_order, auth.uid()
  from public.purchase_order_items where purchase_order_id = p_order;
  update public.products p set purchase_price = i.unit_cost
  from public.purchase_order_items i where i.purchase_order_id = p_order and i.product_id = p.id;
  update public.purchase_orders set status = 'received', received_at = now() where id = p_order;
  select coalesce(sum(quantity * unit_cost), 0) into v_total from public.purchase_order_items where purchase_order_id = p_order;
  if p_create_expense and v_total > 0 then
    insert into public.expenses (salon_id, supplier_id, category, description, amount, created_by)
    values (v_order.salon_id, v_order.supplier_id, 'zbozi', 'Nákup zboží (objednávka)', v_total, auth.uid());
  end if;
end
$$;

create function public.low_stock_products(p_salon uuid)
returns table (id uuid, name text, stock integer, min_stock integer, supplier_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.stock, p.min_stock, p.supplier_id
  from public.products p
  where p.salon_id = p.salon_id and p.salon_id = p_salon and p.archived_at is null and p.stock <= p.min_stock
    and public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[])
  order by p.stock - p.min_stock, p.name
$$;

revoke execute on function public.adjust_stock(uuid, integer, public.stock_movement_kind, text) from public, anon;
revoke execute on function public.add_booking_product(uuid, uuid, integer, uuid) from public, anon;
revoke execute on function public.remove_booking_product(uuid) from public, anon;
revoke execute on function public.create_purchase_order(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.receive_purchase_order(uuid, boolean) from public, anon;
revoke execute on function public.low_stock_products(uuid) from public, anon;

-- Commission rules
create table public.salon_commission_settings (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  mode text not null default 'per_item' check (mode in ('per_item', 'primary_staff')),
  base_mode text not null default 'gross_after_discount'
    check (base_mode in ('gross_after_discount', 'net_after_discount', 'gross_before_discount')),
  include_tips boolean not null default false,
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.salon_commission_settings');

create table public.staff_commission_rules (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid,
  scope public.commission_scope not null default 'all',
  service_id uuid,
  category_id uuid,
  product_id uuid,
  type public.commission_type not null default 'percent',
  percent numeric(5, 2) check (percent is null or percent between 0 and 100),
  fixed_amount bigint check (fixed_amount is null or fixed_amount >= 0),
  tiers jsonb,
  priority smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (service_id, salon_id) references public.services (id, salon_id) on delete cascade,
  foreign key (category_id, salon_id) references public.service_categories (id, salon_id) on delete cascade,
  foreign key (product_id, salon_id) references public.products (id, salon_id) on delete cascade,
  check (type <> 'percent' or percent is not null),
  check (type <> 'fixed' or fixed_amount is not null),
  check (scope <> 'service' or service_id is not null),
  check (scope <> 'category' or category_id is not null),
  check (scope <> 'product' or product_id is not null)
);
create index commission_rules_salon_idx on public.staff_commission_rules (salon_id, staff_id) where active;

create table public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  period_from date not null,
  period_to date not null,
  total bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'paid')),
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (id, salon_id),
  foreign key (staff_id, salon_id) references public.staff (id, salon_id)
);

create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  booking_id uuid not null,
  staff_id uuid not null,
  source text not null check (source in ('service', 'product')),
  ref_id uuid,
  description text not null,
  base_amount bigint not null,
  rate_percent numeric(5, 2),
  fixed_amount bigint,
  amount bigint not null,
  earned_on date not null,
  payout_id uuid,
  created_at timestamptz not null default now(),
  foreign key (booking_id, salon_id) references public.bookings (id, salon_id) on delete cascade,
  foreign key (staff_id, salon_id) references public.staff (id, salon_id),
  foreign key (payout_id, salon_id) references public.commission_payouts (id, salon_id)
);
create index commission_entries_staff_idx on public.commission_entries (staff_id, earned_on);
create index commission_entries_booking_idx on public.commission_entries (booking_id);

create function public._pick_commission_rule(
  p_salon uuid, p_staff uuid, p_service uuid, p_category uuid, p_product uuid
) returns public.staff_commission_rules
language sql stable security definer set search_path = '' as $$
  select r.* from public.staff_commission_rules r
  where r.salon_id = p_salon and r.active
    and (r.staff_id = p_staff or r.staff_id is null)
    and (
      r.scope = 'all'
      or (r.scope = 'service' and r.service_id = p_service)
      or (r.scope = 'category' and r.category_id = p_category)
      or (r.scope = 'product' and r.product_id = p_product)
    )
  order by (case r.scope when 'service' then 300 when 'product' then 300 when 'category' then 200 else 100 end)
         + (case when r.staff_id = p_staff then 50 else 0 end)
         + r.priority desc
  limit 1
$$;

create function public._commission_amount(
  p_rule public.staff_commission_rules, p_base bigint, p_staff uuid, p_month_start date
) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_percent numeric;
  v_month_base bigint;
begin
  if p_rule.type = 'none' then
    return 0;
  elsif p_rule.type = 'fixed' then
    return p_rule.fixed_amount;
  end if;
  v_percent := p_rule.percent;
  if p_rule.tiers is not null then
    select coalesce(sum(base_amount), 0) into v_month_base from public.commission_entries
    where staff_id = p_staff and earned_on >= p_month_start and earned_on < p_month_start + interval '1 month';
    select (t ->> 'percent')::numeric into v_percent
    from jsonb_array_elements(p_rule.tiers) t
    where (t ->> 'from')::bigint <= v_month_base
    order by (t ->> 'from')::bigint desc limit 1;
    v_percent := coalesce(v_percent, p_rule.percent);
  end if;
  return round(p_base * v_percent / 100.0);
end
$$;

create function public._compute_commissions(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_settings public.salon_commission_settings;
  v_tz text;
  v_item record;
  v_staff uuid;
  v_base bigint;
  v_rule public.staff_commission_rules;
  v_amount bigint;
  v_day date;
  v_month date;
begin
  select * into v_b from public.bookings where id = p_booking;
  if not public.plan_has_feature(v_b.salon_id, 'commissions') then
    return;
  end if;
  select * into v_settings from public.salon_commission_settings where salon_id = v_b.salon_id;
  if not found then
    v_settings.mode := 'per_item';
    v_settings.base_mode := 'gross_after_discount';
  end if;
  select timezone into v_tz from public.salons where id = v_b.salon_id;
  v_day := (v_b.starts_at at time zone v_tz)::date;
  v_month := date_trunc('month', v_day)::date;
  delete from public.commission_entries where booking_id = p_booking and payout_id is null;
  for v_item in
    select bi.*, sv.category_id from public.booking_items bi join public.services sv on sv.id = bi.service_id
    where bi.booking_id = p_booking order by bi.position
  loop
    v_staff := case when v_settings.mode = 'primary_staff' then coalesce(v_b.primary_staff_id, v_item.staff_id) else v_item.staff_id end;
    v_base := v_item.price_snap;
    if v_settings.base_mode <> 'gross_before_discount' and v_b.price_total > 0 then
      v_base := v_base - round(v_item.price_snap * v_b.discount_total::numeric / v_b.price_total);
    end if;
    if v_settings.base_mode = 'net_after_discount' then
      v_base := round(v_base / (1 + v_item.vat_snap / 100.0));
    end if;
    v_rule := public._pick_commission_rule(v_b.salon_id, v_staff, v_item.service_id, v_item.category_id, null);
    if v_rule.id is null then
      continue;
    end if;
    v_amount := public._commission_amount(v_rule, v_base, v_staff, v_month);
    insert into public.commission_entries (
      salon_id, booking_id, staff_id, source, ref_id, description, base_amount, rate_percent, fixed_amount, amount, earned_on
    ) values (
      v_b.salon_id, p_booking, v_staff, 'service', v_item.id, v_item.name_snap, v_base,
      case when v_rule.type = 'percent' then v_rule.percent end,
      case when v_rule.type = 'fixed' then v_rule.fixed_amount end, v_amount, v_day
    );
  end loop;
  for v_item in select * from public.booking_products where booking_id = p_booking loop
    v_staff := case when v_settings.mode = 'primary_staff' then coalesce(v_b.primary_staff_id, v_item.staff_id) else coalesce(v_item.staff_id, v_b.primary_staff_id) end;
    if v_staff is null then
      continue;
    end if;
    v_base := v_item.quantity * v_item.unit_price_snap;
    if v_settings.base_mode = 'net_after_discount' then
      v_base := round(v_base / (1 + v_item.vat_snap / 100.0));
    end if;
    v_rule := public._pick_commission_rule(v_b.salon_id, v_staff, null, null, v_item.product_id);
    if v_rule.id is null then
      continue;
    end if;
    v_amount := public._commission_amount(v_rule, v_base, v_staff, v_month);
    insert into public.commission_entries (
      salon_id, booking_id, staff_id, source, ref_id, description, base_amount, rate_percent, fixed_amount, amount, earned_on
    ) values (
      v_b.salon_id, p_booking, v_staff, 'product', v_item.id, v_item.name_snap, v_base,
      case when v_rule.type = 'percent' then v_rule.percent end,
      case when v_rule.type = 'fixed' then v_rule.fixed_amount end, v_amount, v_day
    );
  end loop;
end
$$;

revoke execute on function public._pick_commission_rule(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._commission_amount(public.staff_commission_rules, bigint, uuid, date) from public, anon, authenticated;
revoke execute on function public._compute_commissions(uuid) from public, anon, authenticated;

create function public.booking_commissions_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' then
    perform public._compute_commissions(new.id);
  elsif old.status = 'completed' then
    delete from public.commission_entries where booking_id = new.id and payout_id is null;
  end if;
  return new;
end
$$;

create trigger e_booking_commissions_hook after update of status on public.bookings
for each row when (old.status is distinct from new.status)
execute function public.booking_commissions_hook();

create function public.create_commission_payout(p_staff uuid, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
  v_id uuid;
  v_total bigint;
begin
  select salon_id into v_salon from public.staff where id = p_staff;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(sum(amount), 0) into v_total from public.commission_entries
  where staff_id = p_staff and payout_id is null and earned_on between p_from and p_to;
  if v_total = 0 then
    raise exception 'nothing_to_pay' using errcode = 'P0001';
  end if;
  insert into public.commission_payouts (salon_id, staff_id, period_from, period_to, total, created_by)
  values (v_salon, p_staff, p_from, p_to, v_total, auth.uid()) returning id into v_id;
  update public.commission_entries set payout_id = v_id
  where staff_id = p_staff and payout_id is null and earned_on between p_from and p_to;
  return v_id;
end
$$;

create function public.mark_payout_paid(p_payout uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.commission_payouts where id = p_payout;
  if v_salon is null or not public.has_salon_role(v_salon, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.commission_payouts set status = 'paid', paid_at = now() where id = p_payout and status = 'open';
end
$$;

revoke execute on function public.create_commission_payout(uuid, date, date) from public, anon;
revoke execute on function public.mark_payout_paid(uuid) from public, anon;

-- Attendance
create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  staff_id uuid not null,
  location_id uuid,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  note text,
  foreign key (staff_id, salon_id) references public.staff (id, salon_id) on delete cascade,
  foreign key (location_id, salon_id) references public.locations (id, salon_id),
  check (clock_out is null or clock_out > clock_in)
);
create unique index staff_attendance_one_open on public.staff_attendance (staff_id) where clock_out is null;
create index staff_attendance_idx on public.staff_attendance (staff_id, clock_in desc);

create function public._can_manage_staff(p_staff uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.id = p_staff and (
      s.user_id = auth.uid()
      or public.has_salon_role(s.salon_id, array['owner', 'manager', 'reception']::public.salon_role[])
    )
  )
$$;

create function public.clock_in(p_staff uuid, p_location uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
  v_id uuid;
begin
  if not public._can_manage_staff(p_staff) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select salon_id into v_salon from public.staff where id = p_staff;
  begin
    insert into public.staff_attendance (salon_id, staff_id, location_id) values (v_salon, p_staff, p_location)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_clocked_in' using errcode = 'P0001';
  end;
  return v_id;
end
$$;

create function public.clock_out(p_staff uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._can_manage_staff(p_staff) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.staff_attendance set clock_out = now() where staff_id = p_staff and clock_out is null;
  if not found then
    raise exception 'not_clocked_in' using errcode = 'P0001';
  end if;
end
$$;

revoke execute on function public._can_manage_staff(uuid) from public, anon, authenticated;
revoke execute on function public.clock_in(uuid, uuid) from public, anon;
revoke execute on function public.clock_out(uuid) from public, anon;

-- Policies
select public.apply_tenant_rls('public.suppliers',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.products',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.purchase_orders',
  array['owner', 'manager']::public.salon_role[], null);
select public.apply_tenant_rls('public.purchase_order_items',
  array['owner', 'manager']::public.salon_role[], null);
select public.apply_tenant_rls('public.stock_movements',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.booking_products',
  array['owner', 'manager', 'reception']::public.salon_role[], null);
select public.apply_tenant_rls('public.salon_commission_settings',
  array['owner', 'manager']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.staff_commission_rules',
  array['owner', 'manager']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.commission_payouts',
  array['owner', 'manager']::public.salon_role[], null);
select public.apply_tenant_rls('public.commission_entries',
  array['owner', 'manager']::public.salon_role[], null);
select public.apply_tenant_rls('public.staff_attendance',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);

create policy commission_entries_own on public.commission_entries for select to authenticated
  using (exists (select 1 from public.staff s where s.id = commission_entries.staff_id and s.user_id = auth.uid()));
create policy commission_payouts_own on public.commission_payouts for select to authenticated
  using (exists (select 1 from public.staff s where s.id = commission_payouts.staff_id and s.user_id = auth.uid()));
create policy staff_attendance_own on public.staff_attendance for select to authenticated
  using (exists (select 1 from public.staff s where s.id = staff_attendance.staff_id and s.user_id = auth.uid()));
