create function public.customer_booking_items(p_booking uuid)
returns table (service_id uuid, staff_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select bi.service_id, bi.staff_id, bi.name_snap
  from public.booking_items bi
  where bi.booking_id = p_booking and public.booking_is_customers(p_booking)
  order by bi.position
$$;

revoke execute on function public.customer_booking_items(uuid) from public, anon;
