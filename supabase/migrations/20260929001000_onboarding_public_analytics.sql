-- Content tables
create table public.salon_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  path text not null,
  caption text,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index salon_photos_salon_idx on public.salon_photos (salon_id, sort);

create table public.salon_reviews (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  author text not null,
  rating smallint not null check (rating between 1 and 5),
  body text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index salon_reviews_salon_idx on public.salon_reviews (salon_id, created_at desc);

-- Campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  channel public.notification_channel not null check (channel in ('email', 'push', 'sms')),
  subject text,
  body text not null,
  segment jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'cancelled')),
  sent_count integer not null default 0,
  launched_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index campaigns_salon_idx on public.campaigns (salon_id, created_at desc);

alter table public.notifications
  add constraint notifications_campaign_fk foreign key (campaign_id) references public.campaigns (id) on delete set null;

create function public.segment_clients(p_salon uuid, p_segment jsonb) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.clients c
  left join public.client_stats cs on cs.client_id = c.id
  where c.salon_id = p_salon and c.merged_into is null and c.anonymized_at is null
    and (p_segment ->> 'inactive_days' is null
         or cs.last_visit_at < now() - make_interval(days => (p_segment ->> 'inactive_days')::int))
    and (p_segment ->> 'min_visits' is null or coalesce(cs.visits_count, 0) >= (p_segment ->> 'min_visits')::int)
    and (p_segment ->> 'service_id' is null or cs.favorite_service_id = (p_segment ->> 'service_id')::uuid)
    and (p_segment ->> 'birthday_month' is null or extract(month from c.birthday) = (p_segment ->> 'birthday_month')::int)
$$;

create function public.count_segment(p_salon uuid, p_segment jsonb) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.segment_clients(p_salon, p_segment)
  where public.has_salon_role(p_salon, array['owner', 'manager']::public.salon_role[])
$$;

create function public.launch_campaign(p_campaign uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.campaigns;
  v_client uuid;
  v_count integer := 0;
  v_salon record;
begin
  select * into v_c from public.campaigns where id = p_campaign for update;
  if not found or not public.has_salon_role(v_c.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.plan_has_feature(v_c.salon_id, 'marketing') then
    raise exception 'plan_feature_marketing' using errcode = 'P0001';
  end if;
  if v_c.status <> 'draft' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select name, slug into v_salon from public.salons where id = v_c.salon_id;
  for v_client in select public.segment_clients(v_c.salon_id, v_c.segment) loop
    v_count := v_count + public._enqueue(
      v_c.salon_id, v_client, null, 'campaign', array[v_c.channel], now(),
      'campaign:' || v_c.id || ':' || v_client,
      jsonb_build_object(
        'campaign_id', v_c.id, 'subject', v_c.subject, 'body', v_c.body,
        'salon', jsonb_build_object('name', v_salon.name, 'slug', v_salon.slug),
        'client_id', v_client,
        'first_name', (select first_name from public.clients where id = v_client)
      ),
      true
    );
  end loop;
  update public.notifications set campaign_id = v_c.id where dedupe_key like 'campaign:' || v_c.id || ':%';
  update public.campaigns set status = 'sent', sent_count = v_count, launched_at = now() where id = p_campaign;
  return v_count;
end
$$;

create function public.unsubscribe_client(p_client uuid, p_type public.consent_type default 'marketing_email') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
begin
  select salon_id into v_salon from public.clients where id = p_client;
  if v_salon is null then
    return;
  end if;
  update public.client_consents set revoked_at = now() where client_id = p_client and type = p_type and revoked_at is null;
  if not found then
    insert into public.client_consents (salon_id, client_id, type, granted_at, revoked_at, source)
    values (v_salon, p_client, p_type, now(), now(), 'unsubscribe');
  end if;
end
$$;

create function public.grant_consent(p_client uuid, p_type public.consent_type, p_source text default 'online') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
begin
  select * into v_client from public.clients where id = p_client;
  if not found then
    raise exception 'client_not_found' using errcode = 'P0001';
  end if;
  if not (
    public.has_salon_role(v_client.salon_id, array['owner', 'manager', 'reception']::public.salon_role[])
    or v_client.customer_account_id = public.current_customer_account_id()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.client_consents (salon_id, client_id, type, source)
  values (v_client.salon_id, p_client, p_type, p_source)
  on conflict (client_id, type) where revoked_at is null do nothing;
end
$$;

revoke execute on function public.segment_clients(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.count_segment(uuid, jsonb) from public, anon;
revoke execute on function public.launch_campaign(uuid) from public, anon;
revoke execute on function public.unsubscribe_client(uuid, public.consent_type) from public, anon, authenticated;
revoke execute on function public.grant_consent(uuid, public.consent_type, text) from public, anon;

-- AI assistant
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public.attach_updated_at('public.ai_conversations');

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  salon_id uuid not null references public.salons (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Onboarding
create function public.create_salon(
  p_name text,
  p_slug text,
  p_location_name text default 'Hlavní pobočka',
  p_template text default null,
  p_phone text default null,
  p_street text default null,
  p_city text default null,
  p_zip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_salon uuid;
  v_location uuid;
  v_staff uuid;
  v_category uuid;
  v_name text;
  v_slug text := lower(trim(p_slug));
  v_service jsonb;
  v_templates jsonb := '{
    "barber": {"category": "Barbershop", "services": [["Střih", 30, 40000], ["Vousy", 20, 25000], ["Střih a vousy", 50, 60000]]},
    "hair": {"category": "Kadeřnictví", "services": [["Dámský střih", 60, 90000], ["Pánský střih", 30, 45000], ["Barvení", 120, 220000]]},
    "nails": {"category": "Nehty", "services": [["Manikúra", 60, 55000], ["Gel lak", 75, 75000], ["Pedikúra", 60, 65000]]},
    "lashes": {"category": "Řasy a obočí", "services": [["Prodlužování řas", 120, 180000], ["Doplnění řas", 75, 100000], ["Úprava obočí", 30, 35000]]},
    "cosmetics": {"category": "Kosmetika", "services": [["Ošetření pleti", 60, 120000], ["Hloubkové čištění", 75, 150000], ["Masáž obličeje", 30, 60000]]},
    "massage": {"category": "Masáže", "services": [["Klasická masáž", 60, 90000], ["Sportovní masáž", 60, 100000], ["Relaxační masáž", 90, 130000]]},
    "tattoo": {"category": "Tetování a piercing", "services": [["Konzultace", 30, 0], ["Piercing", 30, 80000], ["Malé tetování", 120, 250000]]}
  }'::jsonb;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'invalid_slug' using errcode = 'P0001';
  end if;
  if v_slug = any (array['www', 'app', 'api', 'admin', 'moje', 'account', 'book', 'login', 'static', 'assets', 'mail',
                         'support', 'help', 'docs', 'status', 'blog', 'auth', 'cdn', 'dashboard', 'terminio']) then
    raise exception 'slug_reserved' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.salons where slug = v_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  if (select count(*) from public.memberships where user_id = v_user and role = 'owner') >= 5 then
    raise exception 'too_many_salons' using errcode = 'P0001';
  end if;

  insert into public.salons (name, slug, phone, address_street, address_city, address_zip, created_by)
  values (trim(p_name), v_slug, p_phone, p_street, p_city, p_zip, v_user)
  returning id into v_salon;

  insert into public.subscriptions (salon_id, plan_code, status) values (v_salon, 'free', 'trialing');
  insert into public.salon_billing_profiles (salon_id) values (v_salon);
  insert into public.salon_commission_settings (salon_id) values (v_salon);
  insert into public.memberships (salon_id, user_id, role) values (v_salon, v_user, 'owner');
  insert into public.profiles (user_id) values (v_user) on conflict do nothing;

  insert into public.locations (salon_id, name, slug, address_street, address_city, address_zip, phone)
  values (v_salon, coalesce(nullif(trim(p_location_name), ''), 'Hlavní pobočka'), 'hlavni', p_street, p_city, p_zip, p_phone)
  returning id into v_location;
  insert into public.location_booking_settings (location_id, salon_id) values (v_location, v_salon);
  insert into public.location_hours (salon_id, location_id, weekday, opens, closes)
  select v_salon, v_location, d, '09:00', '17:00' from generate_series(1, 5) d;

  select coalesce(
    nullif(trim(concat_ws(' ', a.first_name, a.last_name)), ''),
    split_part(coalesce(a.email::text, 'Majitel'), '@', 1)
  ) into v_name from public.customer_accounts a where a.user_id = v_user;
  insert into public.staff (salon_id, user_id, display_name)
  values (v_salon, v_user, coalesce(v_name, 'Majitel')) returning id into v_staff;
  insert into public.staff_locations (staff_id, location_id, salon_id) values (v_staff, v_location, v_salon);
  insert into public.staff_schedules (salon_id, staff_id, location_id, weekday, starts, ends)
  select v_salon, v_staff, v_location, d, '09:00', '17:00' from generate_series(1, 5) d;

  if p_template is not null and v_templates ? p_template then
    insert into public.service_categories (salon_id, name) values (v_salon, v_templates -> p_template ->> 'category')
    returning id into v_category;
    for v_service in select * from jsonb_array_elements(v_templates -> p_template -> 'services') loop
      insert into public.services (salon_id, category_id, name, duration_min, price)
      values (v_salon, v_category, v_service ->> 0, (v_service ->> 1)::int, (v_service ->> 2)::bigint);
    end loop;
  end if;

  perform public.write_audit(v_salon, 'salon.create', 'salon', v_salon, null, jsonb_build_object('slug', v_slug));
  return jsonb_build_object('salon_id', v_salon, 'location_id', v_location, 'staff_id', v_staff);
end
$$;

revoke execute on function public.create_salon(text, text, text, text, text, text, text, text) from public, anon;

create function public.slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(trim(p_slug)) ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    and lower(trim(p_slug)) <> all (array['www', 'app', 'api', 'admin', 'moje', 'account', 'book', 'login', 'static',
      'assets', 'mail', 'support', 'help', 'docs', 'status', 'blog', 'auth', 'cdn', 'dashboard', 'terminio'])
    and not exists (select 1 from public.salons where slug = lower(trim(p_slug)))
$$;

-- Public salon page
create function public.public_salon(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'slug', s.slug, 'description', s.description, 'phone', s.phone, 'email', s.email,
    'website', s.website, 'instagram', s.instagram, 'timezone', s.timezone,
    'address', jsonb_build_object('street', s.address_street, 'city', s.address_city, 'zip', s.address_zip),
    'logo_path', s.logo_path, 'cover_path', s.cover_path, 'brand_color', s.brand_color,
    'google_review_url', s.google_review_url, 'verification_policy', s.verification_policy,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'slug', l.slug, 'street', l.address_street, 'city', l.address_city,
        'zip', l.address_zip, 'lat', l.lat, 'lng', l.lng, 'phone', l.phone,
        'hours', (select coalesce(jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', h.opens, 'closes', h.closes) order by h.weekday, h.opens), '[]'::jsonb)
                  from public.location_hours h where h.location_id = l.id),
        'settings', (select jsonb_build_object('slot_interval_min', bs.slot_interval_min, 'min_notice_min', bs.min_notice_min,
                                               'max_advance_days', bs.max_advance_days, 'confirmation_mode', bs.confirmation_mode,
                                               'cancel_deadline_h', bs.cancel_deadline_h)
                     from public.location_booking_settings bs where bs.location_id = l.id)
      ) order by l.created_at)
      from public.locations l where l.salon_id = s.id and l.archived_at is null
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
      from public.service_categories c where c.salon_id = s.id and c.archived_at is null
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'category_id', sv.category_id, 'name', sv.name, 'description', sv.description,
        'duration_min', sv.duration_min, 'price', sv.price, 'price_is_from', sv.price_is_from
      ) order by sv.sort, sv.name)
      from public.services sv where sv.salon_id = s.id and sv.archived_at is null and sv.online_bookable
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.display_name, 'title', st.title, 'bio', st.bio, 'photo_path', st.photo_path, 'color', st.color,
        'location_ids', (select coalesce(jsonb_agg(sl.location_id), '[]'::jsonb) from public.staff_locations sl where sl.staff_id = st.id),
        'services', (
          select coalesce(jsonb_object_agg(ss.service_id, jsonb_build_object(
            'price', coalesce(ss.price_override, sv.price), 'duration_min', coalesce(ss.duration_override, sv.duration_min)
          )), '{}'::jsonb)
          from public.staff_services ss join public.services sv on sv.id = ss.service_id
          where ss.staff_id = st.id and sv.archived_at is null and sv.online_bookable
        )
      ) order by st.sort, st.display_name)
      from public.staff st where st.salon_id = s.id and st.archived_at is null and st.bookable
    ), '[]'::jsonb),
    'loyalty', (
      select jsonb_build_object('threshold', p.threshold, 'reward_type', p.reward_type, 'reward_value', p.reward_value, 'reward_service', sv.name)
      from public.loyalty_programs p left join public.services sv on sv.id = p.reward_service_id
      where p.salon_id = s.id and p.active and public.plan_has_feature(s.id, 'loyalty')
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('path', ph.path, 'caption', ph.caption) order by ph.sort, ph.created_at)
      from public.salon_photos ph where ph.salon_id = s.id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('author', r.author, 'rating', r.rating, 'body', r.body) order by r.created_at desc)
      from (select * from public.salon_reviews where salon_id = s.id and published order by created_at desc limit 12) r
    ), '[]'::jsonb)
  )
  from public.salons s
  where s.slug = lower(p_slug) and s.archived_at is null and s.status <> 'suspended'
$$;

grant execute on function public.public_salon(text) to anon, authenticated;
grant execute on function public.slug_available(text) to anon, authenticated;

-- Analytics
create function public._staff_schedule_minutes(p_salon uuid, p_from date, p_to date, p_location uuid default null)
returns table (staff_id uuid, day date, minutes numeric)
language sql stable security definer set search_path = '' as $$
  with tz as (select timezone from public.salons where id = p_salon),
  days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d),
  base as (
    select st.id as staff_id, d.day, sch.starts, sch.ends
    from public.staff st
    join public.staff_schedules sch on sch.staff_id = st.id
    cross join days d
    where st.salon_id = p_salon and st.archived_at is null
      and sch.weekday = extract(isodow from d.day)::int
      and (sch.valid_from is null or sch.valid_from <= d.day)
      and (sch.valid_to is null or sch.valid_to >= d.day)
      and (p_location is null or sch.location_id = p_location)
      and not exists (
        select 1 from public.staff_schedule_overrides o
        where o.staff_id = st.id and o.location_id = sch.location_id and o.day = d.day and o.kind = 'off'
      )
    union all
    select o.staff_id, o.day, o.starts, o.ends
    from public.staff_schedule_overrides o
    where o.salon_id = p_salon and o.kind = 'extra' and o.day between p_from and p_to
      and (p_location is null or o.location_id = p_location)
  ),
  ranges as (
    select b.staff_id, b.day,
           tstzrange((b.day + b.starts) at time zone tz.timezone, (b.day + b.ends) at time zone tz.timezone) as r
    from base b cross join tz
  )
  select r.staff_id, r.day,
         coalesce(sum(extract(epoch from upper(x) - lower(x)) / 60), 0)::numeric as minutes
  from ranges r
  cross join lateral unnest(
    tstzmultirange(r.r) - coalesce(
      (select range_agg(t.during) from public.staff_time_off t where t.staff_id = r.staff_id and t.during && r.r),
      '{}'::tstzmultirange
    )
  ) x
  group by r.staff_id, r.day
$$;

revoke execute on function public._staff_schedule_minutes(uuid, date, date, uuid) from public, anon, authenticated;

create function public.owner_snapshot(p_salon uuid, p_from date, p_to date, p_location uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_is_mgmt boolean;
  v_today date;
  v_result jsonb;
begin
  select timezone into v_tz from public.salons where id = p_salon;
  if v_tz is null then
    raise exception 'salon_not_found' using errcode = 'P0001';
  end if;
  v_is_mgmt := public.has_salon_role(p_salon, array['owner', 'manager']::public.salon_role[]);
  v_today := (now() at time zone v_tz)::date;
  if not v_is_mgmt then
    if not public.has_salon_role(p_salon, array['reception']::public.salon_role[])
       or p_from <> p_to or p_from <> v_today then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  v_t0 := p_from::timestamp at time zone v_tz;
  v_t1 := (p_to + 1)::timestamp at time zone v_tz;

  with
  bk as (
    select b.* from public.bookings b
    where b.salon_id = p_salon and b.starts_at >= v_t0 and b.starts_at < v_t1
      and (p_location is null or b.location_id = p_location)
  ),
  done as (select * from bk where status = 'completed'),
  pay as (
    select p.* from public.payments p
    where p.salon_id = p_salon and p.status = 'succeeded' and p.paid_at >= v_t0 and p.paid_at < v_t1
      and (p_location is null or p.location_id = p_location or p.location_id is null)
  ),
  sched as (select * from public._staff_schedule_minutes(p_salon, p_from, p_to, p_location)),
  booked as (
    select bi.staff_id, (bi.starts_at at time zone v_tz)::date as day, sum(bi.duration_snap)::numeric as minutes
    from public.booking_items bi join bk on bk.id = bi.booking_id
    where bk.status in ('confirmed', 'completed')
    group by bi.staff_id, (bi.starts_at at time zone v_tz)::date
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'bookings', jsonb_build_object(
      'total', (select count(*) from bk),
      'completed', (select count(*) from bk where status = 'completed'),
      'upcoming', (select count(*) from bk where status in ('pending', 'confirmed')),
      'pending', (select count(*) from bk where status = 'pending'),
      'cancelled', (select count(*) from bk where status in ('cancelled_by_client', 'cancelled_by_salon')),
      'no_show', (select count(*) from bk where status = 'no_show'),
      'online', (select count(*) from bk where source = 'online')
    ),
    'revenue', jsonb_build_object(
      'received', coalesce((select sum(amount) from pay where kind in ('payment', 'deposit', 'refund')), 0),
      'tips', coalesce((select sum(amount) from pay where kind = 'tip'), 0),
      'earned', coalesce((select sum(price_total - discount_total + products_total) from done), 0),
      'products', coalesce((select sum(products_total) from done), 0),
      'discounts', coalesce((select sum(discount_total) from done), 0),
      'by_method', coalesce((
        select jsonb_object_agg(method, total)
        from (select method, sum(amount) as total from pay where kind in ('payment', 'deposit', 'refund') group by method) m
      ), '{}'::jsonb)
    ),
    'expenses', case when v_is_mgmt then jsonb_build_object(
      'total', coalesce((select sum(amount) from public.expenses e
                         where e.salon_id = p_salon and e.incurred_on between p_from and p_to
                           and (p_location is null or e.location_id = p_location or e.location_id is null)), 0),
      'by_category', coalesce((
        select jsonb_object_agg(category, total) from (
          select category, sum(amount) as total from public.expenses e
          where e.salon_id = p_salon and e.incurred_on between p_from and p_to
          group by category) c
      ), '{}'::jsonb)
    ) else null end,
    'clients', jsonb_build_object(
      'new', (select count(*) from public.clients c where c.salon_id = p_salon and c.created_at >= v_t0 and c.created_at < v_t1 and c.merged_into is null),
      'active', (select count(distinct client_id) from done),
      'returning', (select count(distinct d.client_id) from done d
                    where exists (select 1 from public.bookings o where o.client_id = d.client_id and o.status = 'completed' and o.starts_at < v_t0))
    ),
    'average_spend', coalesce((select round(avg(price_total - discount_total + products_total)) from done), 0),
    'occupancy', jsonb_build_object(
      'booked_min', coalesce((select sum(minutes) from booked), 0),
      'scheduled_min', coalesce((select sum(minutes) from sched), 0),
      'ratio', case when coalesce((select sum(minutes) from sched), 0) > 0
        then round(coalesce((select sum(minutes) from booked), 0) / (select sum(minutes) from sched), 4) else 0 end
    ),
    'by_service', coalesce((
      select jsonb_agg(row_to_json(t) order by t.revenue desc) from (
        select bi.name_snap as name, count(*) as count, sum(bi.price_snap) as revenue
        from public.booking_items bi join done on done.id = bi.booking_id
        group by bi.name_snap order by sum(bi.price_snap) desc limit 10
      ) t
    ), '[]'::jsonb),
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', w.wd,
        'bookings', (select count(*) from bk where bk.status in ('confirmed', 'completed')
                     and extract(isodow from bk.starts_at at time zone v_tz)::int = w.wd),
        'booked_min', coalesce(bw.minutes, 0), 'scheduled_min', coalesce(sw.minutes, 0),
        'ratio', case when coalesce(sw.minutes, 0) > 0 then round(coalesce(bw.minutes, 0) / sw.minutes, 4) else 0 end
      ) order by w.wd)
      from generate_series(1, 7) w(wd)
      left join (select extract(isodow from day)::int as wd, sum(minutes) as minutes from booked group by 1) bw on bw.wd = w.wd
      left join (select extract(isodow from day)::int as wd, sum(minutes) as minutes from sched group by 1) sw on sw.wd = w.wd
    ), '[]'::jsonb),
    'by_staff', case when v_is_mgmt then coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', st.id, 'name', st.display_name,
        'revenue', coalesce((select sum(bi.price_snap) from public.booking_items bi join done on done.id = bi.booking_id where bi.staff_id = st.id), 0),
        'bookings', (select count(distinct bi.booking_id) from public.booking_items bi join done on done.id = bi.booking_id where bi.staff_id = st.id),
        'clients', (select count(distinct done.client_id) from public.booking_items bi join done on done.id = bi.booking_id where bi.staff_id = st.id),
        'booked_min', coalesce((select sum(minutes) from booked where booked.staff_id = st.id), 0),
        'scheduled_min', coalesce((select sum(minutes) from sched where sched.staff_id = st.id), 0),
        'commission', coalesce((select sum(ce.amount) from public.commission_entries ce
                                where ce.staff_id = st.id and ce.earned_on between p_from and p_to), 0)
      ) order by st.display_name)
      from public.staff st where st.salon_id = p_salon and st.archived_at is null
    ), '[]'::jsonb) else null end,
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'received', coalesce(r.total, 0), 'bookings', coalesce(k.n, 0)) order by d.day)
      from generate_series(p_from, p_to, interval '1 day') g(day)
      cross join lateral (select g.day::date as day) d
      left join (select (paid_at at time zone v_tz)::date as day, sum(amount) as total from pay where kind in ('payment', 'deposit', 'refund') group by 1) r on r.day = d.day
      left join (select (starts_at at time zone v_tz)::date as day, count(*) as n from bk where status in ('confirmed', 'completed') group by 1) k on k.day = d.day
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;

revoke execute on function public.owner_snapshot(uuid, date, date, uuid) from public, anon;

create function public.upcoming_bookings(p_salon uuid, p_limit integer default 8)
returns table (id uuid, starts_at timestamptz, client_name text, services text, staff text, status public.booking_status)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, c.full_name,
         (select string_agg(bi.name_snap, ', ' order by bi.position) from public.booking_items bi where bi.booking_id = b.id),
         (select string_agg(distinct st.display_name, ', ') from public.booking_items bi join public.staff st on st.id = bi.staff_id where bi.booking_id = b.id),
         b.status
  from public.bookings b join public.clients c on c.id = b.client_id
  where b.salon_id = p_salon and b.status in ('pending', 'confirmed') and b.starts_at >= now()
    and public.has_salon_role(p_salon, array['owner', 'manager', 'reception']::public.salon_role[])
  order by b.starts_at limit p_limit
$$;

revoke execute on function public.upcoming_bookings(uuid, integer) from public, anon;

-- Storage
do $$
begin
  if to_regnamespace('storage') is not null then
    begin
      insert into storage.buckets (id, name, public) values ('salon-media', 'salon-media', true) on conflict (id) do nothing;
      execute $p$create policy salon_media_read on storage.objects for select to anon, authenticated using (bucket_id = 'salon-media')$p$;
      execute $p$create policy salon_media_write on storage.objects for insert to authenticated
        with check (bucket_id = 'salon-media' and public.has_salon_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.salon_role[]))$p$;
      execute $p$create policy salon_media_update on storage.objects for update to authenticated
        using (bucket_id = 'salon-media' and public.has_salon_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.salon_role[]))$p$;
      execute $p$create policy salon_media_delete on storage.objects for delete to authenticated
        using (bucket_id = 'salon-media' and public.has_salon_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::public.salon_role[]))$p$;
    exception when insufficient_privilege then
      raise notice 'storage policies skipped: create them in the dashboard';
    end;
  end if;
end
$$;
-- Policies
select public.apply_tenant_rls('public.salon_photos',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.salon_reviews',
  array['owner', 'manager', 'reception', 'staff']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.campaigns',
  array['owner', 'manager']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);

alter table public.ai_conversations enable row level security;
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]))
  with check (user_id = auth.uid() and public.has_salon_role(salon_id, array['owner', 'manager']::public.salon_role[]));

alter table public.ai_messages enable row level security;
create policy ai_messages_own on public.ai_messages for all to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
