-- Types
create type public.reward_type as enum ('free_service', 'percent_discount', 'fixed_discount');
create type public.reward_status as enum ('available', 'redeemed', 'expired', 'revoked');
create type public.loyalty_event_type as enum (
  'stamp_earned', 'reward_earned', 'reward_redeemed', 'stamp_expired', 'manual_adjustment'
);

-- Loyalty programs
create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null default 'Věrnostní karta',
  active boolean not null default true,
  threshold smallint not null check (threshold between 1 and 100),
  reward_type public.reward_type not null,
  reward_service_id uuid,
  reward_value bigint,
  reward_scope_service_ids uuid[],
  stamp_valid_months smallint check (stamp_valid_months is null or stamp_valid_months between 1 and 120),
  reward_valid_months smallint check (reward_valid_months is null or reward_valid_months between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, salon_id),
  foreign key (reward_service_id, salon_id) references public.services (id, salon_id),
  check (reward_type <> 'free_service' or reward_service_id is not null),
  check (reward_type <> 'percent_discount' or (reward_value between 1 and 100)),
  check (reward_type <> 'fixed_discount' or reward_value > 0)
);
select public.attach_updated_at('public.loyalty_programs');
create unique index loyalty_one_active_program on public.loyalty_programs (salon_id) where active;

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid not null,
  program_id uuid not null,
  status public.reward_status not null default 'available',
  reward_type public.reward_type not null,
  reward_service_id uuid,
  reward_value bigint,
  reward_scope_service_ids uuid[],
  earned_at timestamptz not null default now(),
  earned_booking_id uuid,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_booking_id uuid,
  unique (id, salon_id),
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade,
  foreign key (program_id, salon_id) references public.loyalty_programs (id, salon_id) on delete cascade
);
create index loyalty_rewards_client_idx on public.loyalty_rewards (client_id, status);

create table public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid not null,
  program_id uuid not null,
  booking_id uuid,
  reward_id uuid references public.loyalty_rewards (id) on delete set null,
  type public.loyalty_event_type not null,
  delta smallint not null default 0,
  reason text,
  reversed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (client_id, salon_id) references public.clients (id, salon_id) on delete cascade,
  foreign key (program_id, salon_id) references public.loyalty_programs (id, salon_id) on delete cascade
);
create unique index loyalty_one_stamp_per_booking on public.loyalty_events (booking_id)
  where type = 'stamp_earned' and reversed_at is null and booking_id is not null;
create index loyalty_events_client_idx on public.loyalty_events (client_id, program_id, created_at);

-- Stamp counting
create function public.loyalty_stamp_count(p_client uuid, p_program uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.loyalty_events e
  join public.loyalty_programs p on p.id = e.program_id
  where e.client_id = p_client and e.program_id = p_program
    and e.type = 'stamp_earned' and e.reversed_at is null and e.reward_id is null
    and (p.stamp_valid_months is null or e.created_at > now() - make_interval(months => p.stamp_valid_months))
$$;

create function public._loyalty_award(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_booking public.bookings;
  v_program public.loyalty_programs;
  v_rows integer;
  v_reward uuid;
begin
  select * into v_booking from public.bookings where id = p_booking;
  select * into v_program from public.loyalty_programs where salon_id = v_booking.salon_id and active;
  if not found or not public.plan_has_feature(v_booking.salon_id, 'loyalty') then
    return;
  end if;
  if not exists (
    select 1 from public.booking_items bi join public.services s on s.id = bi.service_id
    where bi.booking_id = p_booking and s.counts_for_loyalty
  ) then
    return;
  end if;
  if exists (
    select 1 from public.booking_adjustments where booking_id = p_booking and kind = 'loyalty_reward'
  ) then
    return;
  end if;
  insert into public.loyalty_events (salon_id, client_id, program_id, booking_id, type, delta)
  values (v_booking.salon_id, v_booking.client_id, v_program.id, p_booking, 'stamp_earned', 1)
  on conflict (booking_id) where type = 'stamp_earned' and reversed_at is null and booking_id is not null do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;
  end if;
  if public.loyalty_stamp_count(v_booking.client_id, v_program.id) >= v_program.threshold then
    insert into public.loyalty_rewards (
      salon_id, client_id, program_id, reward_type, reward_service_id, reward_value,
      reward_scope_service_ids, earned_booking_id, expires_at
    ) values (
      v_booking.salon_id, v_booking.client_id, v_program.id, v_program.reward_type, v_program.reward_service_id,
      v_program.reward_value, v_program.reward_scope_service_ids, p_booking,
      case when v_program.reward_valid_months is not null then now() + make_interval(months => v_program.reward_valid_months) end
    ) returning id into v_reward;
    update public.loyalty_events set reward_id = v_reward
    where id in (
      select e.id from public.loyalty_events e
      join public.loyalty_programs p on p.id = e.program_id
      where e.client_id = v_booking.client_id and e.program_id = v_program.id
        and e.type = 'stamp_earned' and e.reversed_at is null and e.reward_id is null
        and (p.stamp_valid_months is null or e.created_at > now() - make_interval(months => p.stamp_valid_months))
      order by e.created_at limit v_program.threshold
    );
    insert into public.loyalty_events (salon_id, client_id, program_id, booking_id, reward_id, type)
    values (v_booking.salon_id, v_booking.client_id, v_program.id, p_booking, v_reward, 'reward_earned');
  end if;
end
$$;

create function public._loyalty_revert(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.loyalty_events;
  v_reward public.loyalty_rewards;
begin
  select * into v_event from public.loyalty_events
  where booking_id = p_booking and type = 'stamp_earned' and reversed_at is null;
  if not found then
    return;
  end if;
  update public.loyalty_events set reversed_at = now() where id = v_event.id;
  insert into public.loyalty_events (salon_id, client_id, program_id, booking_id, type, delta, reason)
  values (v_event.salon_id, v_event.client_id, v_event.program_id, p_booking, 'manual_adjustment', -1, 'booking_reverted');
  if v_event.reward_id is not null then
    select * into v_reward from public.loyalty_rewards where id = v_event.reward_id;
    if v_reward.status = 'available' then
      update public.loyalty_rewards set status = 'revoked' where id = v_reward.id;
      update public.loyalty_events set reward_id = null
      where reward_id = v_reward.id and type = 'stamp_earned' and id <> v_event.id;
    end if;
  end if;
end
$$;

create function public._loyalty_release(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_adjustment public.booking_adjustments;
begin
  for v_adjustment in
    select * from public.booking_adjustments where booking_id = p_booking and kind = 'loyalty_reward'
  loop
    update public.loyalty_rewards
    set status = 'available', redeemed_at = null, redeemed_booking_id = null
    where id = v_adjustment.ref_id and status = 'redeemed' and redeemed_booking_id = p_booking;
    delete from public.booking_adjustments where id = v_adjustment.id;
  end loop;
end
$$;

create function public.booking_loyalty_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    perform public._loyalty_award(new.id);
  elsif old.status = 'completed' and new.status <> 'completed' then
    perform public._loyalty_revert(new.id);
  end if;
  if new.status in ('cancelled_by_client', 'cancelled_by_salon', 'no_show') and old.status not in ('cancelled_by_client', 'cancelled_by_salon', 'no_show') then
    perform public._loyalty_release(new.id);
  end if;
  return new;
end
$$;

create trigger b_booking_loyalty_hook after update of status on public.bookings
for each row when (old.status is distinct from new.status)
execute function public.booking_loyalty_hook();

revoke execute on function public._loyalty_award(uuid) from public, anon, authenticated;
revoke execute on function public._loyalty_revert(uuid) from public, anon, authenticated;
revoke execute on function public._loyalty_release(uuid) from public, anon, authenticated;

-- Reward redemption
create function public.redeem_reward(p_reward uuid, p_booking uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_reward public.loyalty_rewards;
  v_booking public.bookings;
  v_base bigint;
  v_discount bigint;
  v_label text;
begin
  select * into v_reward from public.loyalty_rewards where id = p_reward for update;
  select * into v_booking from public.bookings where id = p_booking for update;
  if v_reward.id is null or v_booking.id is null or v_reward.salon_id <> v_booking.salon_id then
    raise exception 'reward_not_found' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_booking.salon_id, array['owner', 'manager', 'reception']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reward.status <> 'available' or (v_reward.expires_at is not null and v_reward.expires_at < now()) then
    raise exception 'reward_unavailable' using errcode = 'P0001';
  end if;
  if v_reward.client_id <> v_booking.client_id or v_booking.status not in ('pending', 'confirmed') then
    raise exception 'reward_booking_mismatch' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_adjustments where booking_id = p_booking and kind = 'loyalty_reward') then
    raise exception 'reward_already_applied' using errcode = 'P0001';
  end if;
  if v_reward.reward_type = 'free_service' then
    select price_snap, name_snap into v_discount, v_label from public.booking_items
    where booking_id = p_booking and service_id = v_reward.reward_service_id
    order by position limit 1;
    if v_discount is null then
      raise exception 'reward_service_missing' using errcode = 'P0001';
    end if;
    v_label := 'Věrnostní odměna: ' || v_label || ' zdarma';
  else
    select coalesce(sum(price_snap), 0) into v_base from public.booking_items
    where booking_id = p_booking
      and (v_reward.reward_scope_service_ids is null or service_id = any (v_reward.reward_scope_service_ids));
    if v_base = 0 then
      raise exception 'reward_service_missing' using errcode = 'P0001';
    end if;
    if v_reward.reward_type = 'percent_discount' then
      v_discount := round(v_base * v_reward.reward_value / 100.0);
      v_label := 'Věrnostní odměna: sleva ' || v_reward.reward_value || ' %';
    else
      v_discount := least(v_base, v_reward.reward_value);
      v_label := 'Věrnostní odměna: sleva';
    end if;
  end if;
  insert into public.booking_adjustments (salon_id, booking_id, kind, label, amount, ref_id, created_by)
  values (v_booking.salon_id, p_booking, 'loyalty_reward', v_label, -v_discount, p_reward, auth.uid());
  update public.loyalty_rewards
  set status = 'redeemed', redeemed_at = now(), redeemed_booking_id = p_booking
  where id = p_reward;
  insert into public.loyalty_events (salon_id, client_id, program_id, booking_id, reward_id, type, created_by)
  values (v_booking.salon_id, v_booking.client_id, v_reward.program_id, p_booking, p_reward, 'reward_redeemed', auth.uid());
  return v_discount;
end
$$;

create function public.adjust_loyalty_stamps(p_client uuid, p_delta integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_program public.loyalty_programs;
  v_i integer;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or not public.has_salon_role(v_client.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into v_program from public.loyalty_programs where salon_id = v_client.salon_id and active;
  if not found then
    raise exception 'no_program' using errcode = 'P0001';
  end if;
  if p_delta > 0 then
    for v_i in 1..p_delta loop
      insert into public.loyalty_events (salon_id, client_id, program_id, type, delta, reason, created_by)
      values (v_client.salon_id, p_client, v_program.id, 'stamp_earned', 1, p_reason, auth.uid());
    end loop;
  elsif p_delta < 0 then
    update public.loyalty_events set reversed_at = now()
    where id in (
      select id from public.loyalty_events
      where client_id = p_client and program_id = v_program.id and type = 'stamp_earned'
        and reversed_at is null and reward_id is null
      order by created_at desc limit -p_delta
    );
    insert into public.loyalty_events (salon_id, client_id, program_id, type, delta, reason, created_by)
    values (v_client.salon_id, p_client, v_program.id, 'manual_adjustment', p_delta, p_reason, auth.uid());
  end if;
  if public.loyalty_stamp_count(p_client, v_program.id) >= v_program.threshold then
    perform public._loyalty_grant_pending(p_client, v_program.id);
  end if;
  perform public.write_audit(v_client.salon_id, 'loyalty.adjust', 'client', p_client, null,
    jsonb_build_object('delta', p_delta, 'reason', p_reason));
end
$$;

create function public._loyalty_grant_pending(p_client uuid, p_program uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_program public.loyalty_programs;
  v_salon uuid;
  v_reward uuid;
begin
  select * into v_program from public.loyalty_programs where id = p_program;
  select salon_id into v_salon from public.clients where id = p_client;
  while public.loyalty_stamp_count(p_client, p_program) >= v_program.threshold loop
    insert into public.loyalty_rewards (
      salon_id, client_id, program_id, reward_type, reward_service_id, reward_value,
      reward_scope_service_ids, expires_at
    ) values (
      v_salon, p_client, p_program, v_program.reward_type, v_program.reward_service_id, v_program.reward_value,
      v_program.reward_scope_service_ids,
      case when v_program.reward_valid_months is not null then now() + make_interval(months => v_program.reward_valid_months) end
    ) returning id into v_reward;
    update public.loyalty_events set reward_id = v_reward
    where id in (
      select e.id from public.loyalty_events e
      where e.client_id = p_client and e.program_id = p_program and e.type = 'stamp_earned'
        and e.reversed_at is null and e.reward_id is null
      order by e.created_at limit v_program.threshold
    );
    insert into public.loyalty_events (salon_id, client_id, program_id, reward_id, type)
    values (v_salon, p_client, p_program, v_reward, 'reward_earned');
  end loop;
end
$$;

create function public.expire_loyalty_rewards() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with expired as (
    update public.loyalty_rewards set status = 'expired'
    where status = 'available' and expires_at is not null and expires_at < now()
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end
$$;

revoke execute on function public._loyalty_grant_pending(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.expire_loyalty_rewards() from public, anon, authenticated;
revoke execute on function public.redeem_reward(uuid, uuid) from public, anon;
revoke execute on function public.adjust_loyalty_stamps(uuid, integer, text) from public, anon;

create function public.customer_loyalty_cards() returns table (
  salon_id uuid,
  salon_name text,
  salon_slug text,
  client_id uuid,
  program_id uuid,
  threshold integer,
  stamps integer,
  reward_type public.reward_type,
  reward_value bigint,
  reward_service_name text,
  available_rewards integer
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug::text, c.id, p.id, p.threshold::int,
         public.loyalty_stamp_count(c.id, p.id),
         p.reward_type, p.reward_value, sv.name,
         (select count(*)::int from public.loyalty_rewards r
          where r.client_id = c.id and r.program_id = p.id and r.status = 'available'
            and (r.expires_at is null or r.expires_at > now()))
  from public.clients c
  join public.salons s on s.id = c.salon_id
  join public.loyalty_programs p on p.salon_id = s.id and p.active
  left join public.services sv on sv.id = p.reward_service_id
  where c.customer_account_id = public.current_customer_account_id() and c.merged_into is null
$$;

revoke execute on function public.customer_loyalty_cards() from public, anon;

-- Client statistics
create function public.refresh_client_stats(p_client uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_salon uuid;
  v_visits integer;
  v_avg numeric;
  v_last timestamptz;
begin
  select salon_id into v_salon from public.clients where id = p_client;
  if v_salon is null then
    return;
  end if;
  select count(*), max(starts_at) into v_visits, v_last
  from public.bookings where client_id = p_client and status = 'completed';
  select avg(gap) into v_avg from (
    select extract(epoch from (starts_at - lag(starts_at) over (order by starts_at))) / 86400.0 as gap
    from (
      select starts_at from public.bookings
      where client_id = p_client and status = 'completed'
      order by starts_at desc limit 10
    ) recent
  ) gaps where gap is not null;
  insert into public.client_stats (
    client_id, salon_id, visits_count, no_show_count, cancelled_count, total_spent,
    first_visit_at, last_visit_at, avg_interval_days, next_expected_at, favorite_staff_id, favorite_service_id
  )
  select
    p_client, v_salon, v_visits,
    (select count(*) from public.bookings where client_id = p_client and status = 'no_show'),
    (select count(*) from public.bookings where client_id = p_client and status = 'cancelled_by_client'),
    coalesce((select sum(price_total - discount_total) from public.bookings where client_id = p_client and status = 'completed'), 0),
    (select min(starts_at) from public.bookings where client_id = p_client and status = 'completed'),
    v_last,
    case when v_visits >= 3 then round(v_avg, 2) end,
    case when v_visits >= 3 and v_avg is not null then v_last + make_interval(secs => (v_avg * 86400)::int) end,
    (select primary_staff_id from public.bookings where client_id = p_client and status = 'completed' and primary_staff_id is not null
       group by primary_staff_id order by count(*) desc, max(starts_at) desc limit 1),
    (select bi.service_id from public.booking_items bi join public.bookings b on b.id = bi.booking_id
       where b.client_id = p_client and b.status = 'completed'
       group by bi.service_id order by count(*) desc, max(b.starts_at) desc limit 1)
  on conflict (client_id) do update set
    visits_count = excluded.visits_count, no_show_count = excluded.no_show_count,
    cancelled_count = excluded.cancelled_count, total_spent = excluded.total_spent,
    first_visit_at = excluded.first_visit_at, last_visit_at = excluded.last_visit_at,
    avg_interval_days = excluded.avg_interval_days, next_expected_at = excluded.next_expected_at,
    favorite_staff_id = excluded.favorite_staff_id, favorite_service_id = excluded.favorite_service_id,
    updated_at = now();
end
$$;

revoke execute on function public.refresh_client_stats(uuid) from public, anon, authenticated;

create function public.booking_stats_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_client_stats(new.client_id);
  return new;
end
$$;

create trigger c_booking_stats_hook after update of status on public.bookings
for each row when (old.status is distinct from new.status)
execute function public.booking_stats_hook();

-- Client merge
create function public.merge_clients(p_keep uuid, p_merge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_keep public.clients;
  v_merge public.clients;
  v_table text;
begin
  select * into v_keep from public.clients where id = p_keep;
  select * into v_merge from public.clients where id = p_merge;
  if v_keep.id is null or v_merge.id is null or v_keep.salon_id <> v_merge.salon_id or p_keep = p_merge then
    raise exception 'client_not_found' using errcode = 'P0001';
  end if;
  if not public.has_salon_role(v_keep.salon_id, array['owner', 'manager']::public.salon_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.client_consents m
  where m.client_id = p_merge and m.revoked_at is null
    and exists (select 1 from public.client_consents k where k.client_id = p_keep and k.type = m.type and k.revoked_at is null);
  delete from public.client_stats where client_id = p_merge;
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'client_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in ('client_stats')
  loop
    execute format('update public.%I set client_id = $1 where client_id = $2', v_table) using p_keep, p_merge;
  end loop;
  update public.clients set merged_into = p_keep, phone = null, email = null, customer_account_id = null,
    anonymized_at = null
  where id = p_merge;
  update public.clients set
    phone = coalesce(phone, v_merge.phone), email = coalesce(email, v_merge.email),
    birthday = coalesce(birthday, v_merge.birthday),
    customer_account_id = coalesce(customer_account_id, v_merge.customer_account_id)
  where id = p_keep;
  perform public.refresh_client_stats(p_keep);
  perform public.write_audit(v_keep.salon_id, 'client.merge', 'client', p_keep, null,
    jsonb_build_object('merged', p_merge));
end
$$;

revoke execute on function public.merge_clients(uuid, uuid) from public, anon;

-- Policies
select public.apply_tenant_rls('public.loyalty_programs',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.loyalty_rewards',
  array['owner', 'manager', 'reception']::public.salon_role[],
  null);
select public.apply_tenant_rls('public.loyalty_events',
  array['owner', 'manager', 'reception']::public.salon_role[],
  null);

create policy loyalty_rewards_customer on public.loyalty_rewards for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = loyalty_rewards.client_id and c.customer_account_id = public.current_customer_account_id()
  ));
