create function public.customer_join_waitlist(
  p_location uuid,
  p_service_ids uuid[],
  p_staff uuid,
  p_from date,
  p_to date,
  p_time_from time default null,
  p_time_to time default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_account public.customer_accounts;
  v_salon public.salons;
  v_client uuid;
  v_id uuid;
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
  if not public.plan_has_feature(v_salon.id, 'waitlist') then
    raise exception 'feature_unavailable' using errcode = 'P0001';
  end if;
  if v_account.email_verified_at is null then
    raise exception 'verification_required' using errcode = 'P0001';
  end if;
  if p_to < p_from or p_from < current_date - 1 or p_to > current_date + 120 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_service_ids, 1), 0) = 0 or exists (
    select 1 from public.services where id = any (p_service_ids) and (salon_id <> v_salon.id or not online_bookable)
  ) then
    raise exception 'service_not_bookable' using errcode = 'P0001';
  end if;
  v_client := public._link_client(v_salon.id, v_account.id);
  if (select count(*) from public.waitlist_entries where client_id = v_client and status in ('waiting', 'offered')) >= 5 then
    raise exception 'too_many_bookings' using errcode = 'P0001';
  end if;
  insert into public.waitlist_entries (salon_id, location_id, client_id, service_ids, staff_id, date_from, date_to, time_from, time_to)
  values (v_salon.id, p_location, v_client, p_service_ids, p_staff, p_from, p_to, p_time_from, p_time_to)
  returning id into v_id;
  return v_id;
end
$$;

create function public.customer_waitlist()
returns table (
  id uuid,
  salon_name text,
  salon_slug text,
  location_id uuid,
  services text,
  date_from date,
  date_to date,
  time_from time,
  time_to time,
  status text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select w.id, s.name, s.slug::text, w.location_id,
         (select string_agg(sv.name, ', ') from public.services sv where sv.id = any (w.service_ids)),
         w.date_from, w.date_to, w.time_from, w.time_to, w.status, w.created_at
  from public.waitlist_entries w
  join public.clients c on c.id = w.client_id
  join public.salons s on s.id = w.salon_id
  where c.customer_account_id = public.current_customer_account_id() and w.status in ('waiting', 'offered')
  order by w.created_at desc
$$;

create function public.customer_cancel_waitlist(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.waitlist_entries w set status = 'cancelled'
  where w.id = p_id and w.status in ('waiting', 'offered')
    and exists (select 1 from public.clients c where c.id = w.client_id and c.customer_account_id = public.current_customer_account_id())
$$;

create function public.unsubscribe_client_marketing(p_client uuid) returns void
language sql security definer set search_path = '' as $$
  update public.client_consents set revoked_at = now()
  where client_id = p_client and type in ('marketing_email', 'marketing_push', 'marketing_sms') and revoked_at is null
$$;

revoke execute on function public.customer_join_waitlist(uuid, uuid[], uuid, date, date, time, time) from public, anon;
revoke execute on function public.customer_waitlist() from public, anon;
revoke execute on function public.customer_cancel_waitlist(uuid) from public, anon;
revoke execute on function public.unsubscribe_client_marketing(uuid) from public, anon, authenticated;
