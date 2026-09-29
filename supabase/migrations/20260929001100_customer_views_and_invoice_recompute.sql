-- Invoice draft totals
create function public.recompute_invoice_draft(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.invoices where id = p_invoice and status = 'draft';
  if v_salon is null then
    raise exception 'invoice_immutable' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_salon, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public._recompute_invoice(p_invoice);
end
$$;

revoke execute on function public.recompute_invoice_draft(uuid) from public, anon;

-- Customer views
create function public.customer_bookings()
returns table (
  id uuid,
  salon_id uuid,
  salon_name text,
  salon_slug text,
  brand_color text,
  timezone text,
  location_id uuid,
  location_name text,
  location_address text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  services text,
  staff text,
  price_total bigint,
  discount_total bigint,
  products_total bigint,
  deposit_amount bigint,
  can_change boolean
)
language sql stable security definer set search_path = '' as $$
  select b.id, s.id, s.name, s.slug::text, s.brand_color, s.timezone, l.id, l.name,
         nullif(concat_ws(', ', l.address_street, l.address_city), ''),
         b.starts_at, b.ends_at, b.status,
         (select string_agg(bi.name_snap, ', ' order by bi.position) from public.booking_items bi where bi.booking_id = b.id),
         (select string_agg(distinct st.display_name, ', ') from public.booking_items bi join public.staff st on st.id = bi.staff_id where bi.booking_id = b.id),
         b.price_total, b.discount_total, b.products_total, b.deposit_amount,
         (b.status in ('pending', 'confirmed')
          and now() <= b.starts_at - make_interval(hours => coalesce(bs.cancel_deadline_h, 0)))
  from public.bookings b
  join public.clients c on c.id = b.client_id
  join public.salons s on s.id = b.salon_id
  join public.locations l on l.id = b.location_id
  left join public.location_booking_settings bs on bs.location_id = b.location_id
  where c.customer_account_id = public.current_customer_account_id()
  order by b.starts_at desc
  limit 300
$$;

create function public.customer_salons()
returns table (
  salon_id uuid,
  name text,
  slug text,
  city text,
  brand_color text,
  visits integer,
  last_visit_at timestamptz,
  client_id uuid
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug::text, s.address_city, s.brand_color,
         coalesce(cs.visits_count, 0), cs.last_visit_at, c.id
  from public.clients c
  join public.salons s on s.id = c.salon_id
  left join public.client_stats cs on cs.client_id = c.id
  where c.customer_account_id = public.current_customer_account_id() and c.merged_into is null
    and s.archived_at is null and s.status <> 'suspended'
  order by cs.last_visit_at desc nulls last, s.name
$$;

revoke execute on function public.customer_bookings() from public, anon;
revoke execute on function public.customer_salons() from public, anon;
