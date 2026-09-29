-- Types
create type public.notification_channel as enum ('email', 'push', 'sms', 'in_app');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled', 'skipped');
create type public.automation_type as enum (
  'booking_confirmation', 'booking_received', 'booking_reminder', 'booking_cancellation',
  'booking_rescheduled', 'return_reminder', 'followup', 'review_request', 'birthday', 'waitlist_offer'
);

-- Automations
create table public.automation_defaults (
  type public.automation_type primary key,
  enabled boolean not null,
  config jsonb not null default '{}'::jsonb,
  requires_feature text
);

insert into public.automation_defaults (type, enabled, config, requires_feature) values
  ('booking_confirmation', true, '{}', null),
  ('booking_received', true, '{}', null),
  ('booking_reminder', true, '{"hours_before":24}', null),
  ('booking_cancellation', true, '{}', null),
  ('booking_rescheduled', true, '{}', null),
  ('return_reminder', true, '{"tolerance_days":3,"second_factor":2}', 'automations'),
  ('followup', false, '{"hours_after":3}', 'automations'),
  ('review_request', false, '{"hours_after":24}', 'automations'),
  ('birthday', false, '{}', 'automations'),
  ('waitlist_offer', true, '{}', 'waitlist');

alter table public.automation_defaults enable row level security;
create policy automation_defaults_read on public.automation_defaults for select to authenticated using (true);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  type public.automation_type not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  channels public.notification_channel[] not null default array['email', 'push']::public.notification_channel[],
  updated_at timestamptz not null default now(),
  unique (salon_id, type),
  check (channels <@ array['email', 'push', 'sms']::public.notification_channel[])
);
select public.attach_updated_at('public.automations');

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  type public.automation_type not null,
  channel public.notification_channel not null,
  subject text,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (salon_id, type, channel)
);
select public.attach_updated_at('public.notification_templates');

create function public._automation(p_salon uuid, p_type public.automation_type)
returns table (enabled boolean, config jsonb, channels public.notification_channel[])
language sql stable security definer set search_path = '' as $$
  select
    case when d.requires_feature is not null and not public.plan_has_feature(p_salon, d.requires_feature)
      then false else coalesce(a.enabled, d.enabled) end,
    d.config || coalesce(a.config, '{}'::jsonb),
    coalesce(a.channels, array['email', 'push']::public.notification_channel[])
  from public.automation_defaults d
  left join public.automations a on a.salon_id = p_salon and a.type = d.type
  where d.type = p_type
$$;

revoke execute on function public._automation(uuid, public.automation_type) from public, anon, authenticated;

-- SMS credits
create table public.sms_credits_ledger (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref uuid,
  created_at timestamptz not null default now()
);
create index sms_credits_salon_idx on public.sms_credits_ledger (salon_id, created_at desc);

create function public.salon_sms_balance(p_salon uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.sms_credits_ledger where salon_id = p_salon
$$;

create function public.salon_sms_enabled(p_salon uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.plan_limit(p_salon, 'sms_included') > 0 and public.salon_sms_balance(p_salon) > 0
$$;

create function public.grant_sms_credits(p_salon uuid, p_amount integer, p_reason text) returns void
language sql security definer set search_path = '' as $$
  insert into public.sms_credits_ledger (salon_id, delta, reason) values (p_salon, p_amount, p_reason)
$$;

revoke execute on function public.grant_sms_credits(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.salon_sms_balance(uuid) from public, anon;
revoke execute on function public.salon_sms_enabled(uuid) from public, anon;

-- Outbox
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  client_id uuid,
  user_id uuid references auth.users (id) on delete cascade,
  booking_id uuid,
  campaign_id uuid,
  channel public.notification_channel not null,
  type text not null,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status public.notification_status not null default 'queued',
  attempts smallint not null default 0,
  last_error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  provider_id text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index notifications_due_idx on public.notifications (scheduled_for) where status = 'queued';
create index notifications_booking_idx on public.notifications (booking_id);
create index notifications_user_idx on public.notifications (user_id, created_at desc) where channel = 'in_app';
create index notifications_salon_idx on public.notifications (salon_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

-- Enqueue
create function public._enqueue(
  p_salon uuid,
  p_client uuid,
  p_booking uuid,
  p_type text,
  p_channels public.notification_channel[],
  p_scheduled timestamptz,
  p_dedupe text,
  p_payload jsonb,
  p_marketing boolean default false
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_account public.customer_accounts;
  v_channel public.notification_channel;
  v_count integer := 0;
  v_rows integer;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or v_client.anonymized_at is not null or v_client.merged_into is not null then
    return 0;
  end if;
  select * into v_account from public.customer_accounts where id = v_client.customer_account_id;
  foreach v_channel in array p_channels loop
    if v_channel = 'email' then
      if v_client.email is null then
        continue;
      end if;
      if p_marketing and public.has_revoked_consent(p_client, 'marketing_email') then
        continue;
      end if;
      insert into public.notifications (salon_id, client_id, booking_id, channel, type, recipient, payload, scheduled_for, dedupe_key)
      values (p_salon, p_client, p_booking, 'email', p_type, v_client.email, p_payload, p_scheduled, p_dedupe || ':email')
      on conflict (dedupe_key) do nothing;
    elsif v_channel = 'push' then
      if v_account.id is null or not exists (
        select 1 from public.push_subscriptions where user_id = v_account.user_id and disabled_at is null
      ) then
        continue;
      end if;
      if p_marketing and not public.has_consent(p_client, 'marketing_push') then
        continue;
      end if;
      insert into public.notifications (salon_id, client_id, user_id, booking_id, channel, type, payload, scheduled_for, dedupe_key)
      values (p_salon, p_client, v_account.user_id, p_booking, 'push', p_type, p_payload, p_scheduled, p_dedupe || ':push')
      on conflict (dedupe_key) do nothing;
    elsif v_channel = 'sms' then
      if v_client.phone is null or not public.salon_sms_enabled(p_salon) then
        continue;
      end if;
      if p_marketing and not public.has_consent(p_client, 'marketing_sms') then
        continue;
      end if;
      insert into public.notifications (salon_id, client_id, booking_id, channel, type, recipient, payload, scheduled_for, dedupe_key)
      values (p_salon, p_client, p_booking, 'sms', p_type, v_client.phone, p_payload, p_scheduled, p_dedupe || ':sms')
      on conflict (dedupe_key) do nothing;
    else
      continue;
    end if;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end
$$;

create function public._enqueue_staff(
  p_salon uuid,
  p_booking uuid,
  p_type text,
  p_payload jsonb,
  p_dedupe text,
  p_include_management boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct u from (
      select s.user_id as u from public.bookings b join public.staff s on s.id = b.primary_staff_id where b.id = p_booking
      union all
      select m.user_id from public.memberships m
      where p_include_management and m.salon_id = p_salon and m.role in ('owner', 'manager')
    ) t where u is not null and u is distinct from auth.uid()
  loop
    insert into public.notifications (salon_id, user_id, booking_id, channel, type, payload, status, sent_at, dedupe_key)
    values (p_salon, v_user, p_booking, 'in_app', p_type, p_payload, 'sent', now(), p_dedupe || ':in_app:' || v_user)
    on conflict (dedupe_key) do nothing;
    if exists (select 1 from public.push_subscriptions where user_id = v_user and disabled_at is null) then
      insert into public.notifications (salon_id, user_id, booking_id, channel, type, payload, dedupe_key)
      values (p_salon, v_user, p_booking, 'push', p_type, p_payload, p_dedupe || ':push:' || v_user)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end
$$;

create function public._booking_payload(p_booking uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'booking_id', b.id,
    'status', b.status,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'timezone', s.timezone,
    'price_total', b.price_total,
    'discount_total', b.discount_total,
    'salon', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'phone', s.phone, 'brand_color', s.brand_color),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'street', l.address_street, 'city', l.address_city),
    'client', jsonb_build_object('id', c.id, 'first_name', c.first_name, 'last_name', c.last_name),
    'staff', (
      select coalesce(jsonb_agg(distinct st.display_name), '[]'::jsonb)
      from public.booking_items bi join public.staff st on st.id = bi.staff_id where bi.booking_id = b.id
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object('name', bi.name_snap, 'price', bi.price_snap, 'duration', bi.duration_snap) order by bi.position), '[]'::jsonb)
      from public.booking_items bi where bi.booking_id = b.id
    )
  )
  from public.bookings b
  join public.salons s on s.id = b.salon_id
  join public.locations l on l.id = b.location_id
  join public.clients c on c.id = b.client_id
  where b.id = p_booking
$$;

revoke execute on function public._enqueue(uuid, uuid, uuid, text, public.notification_channel[], timestamptz, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public._enqueue_staff(uuid, uuid, text, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public._booking_payload(uuid) from public, anon, authenticated;

-- Booking notifications
create function public._notify_client(p_booking uuid, p_type public.automation_type, p_dedupe text, p_at timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_auto record;
begin
  select * into v_b from public.bookings where id = p_booking;
  select * into v_auto from public._automation(v_b.salon_id, p_type);
  if not v_auto.enabled then
    return;
  end if;
  perform public._enqueue(
    v_b.salon_id, v_b.client_id, p_booking, p_type::text, v_auto.channels,
    coalesce(p_at, now()), p_dedupe, public._booking_payload(p_booking)
  );
end
$$;

create function public._schedule_reminder(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_auto record;
  v_at timestamptz;
begin
  select * into v_b from public.bookings where id = p_booking;
  select * into v_auto from public._automation(v_b.salon_id, 'booking_reminder');
  if not v_auto.enabled then
    return;
  end if;
  v_at := v_b.starts_at - make_interval(hours => coalesce((v_auto.config ->> 'hours_before')::int, 24));
  if v_at > now() then
    perform public._notify_client(
      p_booking, 'booking_reminder',
      'reminder:' || p_booking || ':' || extract(epoch from v_b.starts_at)::bigint, v_at
    );
  end if;
end
$$;

create function public._cancel_queued(p_booking uuid, p_types text[]) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set status = 'cancelled'
  where booking_id = p_booking and status = 'queued' and type = any (p_types)
$$;

revoke execute on function public._notify_client(uuid, public.automation_type, text, timestamptz) from public, anon, authenticated;
revoke execute on function public._schedule_reminder(uuid) from public, anon, authenticated;
revoke execute on function public._cancel_queued(uuid, text[]) from public, anon, authenticated;

create or replace function public._booking_created_hook(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking;
  if v_b.status = 'confirmed' then
    perform public._notify_client(p_booking, 'booking_confirmation', 'confirm:' || p_booking);
    perform public._schedule_reminder(p_booking);
  else
    perform public._notify_client(p_booking, 'booking_received', 'received:' || p_booking);
  end if;
  if v_b.source = 'online' or v_b.status = 'pending' then
    perform public._enqueue_staff(
      v_b.salon_id, p_booking,
      case when v_b.status = 'pending' then 'staff_booking_pending' else 'staff_new_booking' end,
      public._booking_payload(p_booking), 'staff-new:' || p_booking
    );
  end if;
end
$$;

create or replace function public._booking_moved_hook(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking;
  perform public._cancel_queued(p_booking, array['booking_reminder']);
  perform public._notify_client(
    p_booking, 'booking_rescheduled',
    'moved:' || p_booking || ':' || extract(epoch from v_b.starts_at)::bigint
  );
  perform public._schedule_reminder(p_booking);
  if public.booking_is_customers(p_booking) then
    perform public._enqueue_staff(
      v_b.salon_id, p_booking, 'staff_booking_moved', public._booking_payload(p_booking),
      'staff-moved:' || p_booking || ':' || extract(epoch from v_b.starts_at)::bigint
    );
  end if;
end
$$;

create function public._offer_waitlist(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_auto record;
  v_tz text;
  v_entry public.waitlist_entries;
  v_local timestamp;
  v_offered integer := 0;
begin
  select * into v_b from public.bookings where id = p_booking;
  select * into v_auto from public._automation(v_b.salon_id, 'waitlist_offer');
  if not v_auto.enabled or v_b.starts_at < now() then
    return;
  end if;
  select timezone into v_tz from public.salons where id = v_b.salon_id;
  v_local := v_b.starts_at at time zone v_tz;
  for v_entry in
    select * from public.waitlist_entries
    where location_id = v_b.location_id and status = 'waiting' and client_id <> v_b.client_id
      and v_local::date between date_from and date_to
      and (time_from is null or v_local::time >= time_from)
      and (time_to is null or v_local::time <= time_to)
    order by created_at
  loop
    exit when v_offered >= 3;
    if exists (
      select 1 from public.get_availability(v_entry.location_id, v_entry.service_ids, v_local::date, v_local::date, v_entry.staff_id) g
      where g.slot_start = v_b.starts_at
    ) then
      update public.waitlist_entries set status = 'offered', offered_at = now() where id = v_entry.id;
      perform public._enqueue(
        v_b.salon_id, v_entry.client_id, null, 'waitlist_offer', v_auto.channels, now(),
        'waitlist:' || v_entry.id || ':' || extract(epoch from v_b.starts_at)::bigint,
        jsonb_build_object(
          'waitlist_entry_id', v_entry.id, 'starts_at', v_b.starts_at, 'timezone', v_tz,
          'location_id', v_b.location_id, 'service_ids', v_entry.service_ids,
          'salon', (select jsonb_build_object('name', name, 'slug', slug) from public.salons where id = v_b.salon_id)
        )
      );
      v_offered := v_offered + 1;
    end if;
  end loop;
end
$$;

revoke execute on function public._offer_waitlist(uuid) from public, anon, authenticated;

create function public.booking_notifications_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_auto record;
begin
  if new.status = 'confirmed' and old.status = 'pending' then
    perform public._notify_client(new.id, 'booking_confirmation', 'confirm:' || new.id);
    perform public._schedule_reminder(new.id);
  elsif new.status = 'confirmed' and old.status <> 'pending' then
    perform public._schedule_reminder(new.id);
  elsif new.status in ('cancelled_by_client', 'cancelled_by_salon') then
    perform public._cancel_queued(new.id, array['booking_reminder', 'followup', 'review_request']);
    if new.cancel_reason is distinct from 'expired' then
      perform public._notify_client(new.id, 'booking_cancellation', 'cancel:' || new.id || ':' || extract(epoch from now())::bigint);
    end if;
    if new.status = 'cancelled_by_client' then
      perform public._enqueue_staff(
        new.salon_id, new.id, 'staff_booking_cancelled', public._booking_payload(new.id),
        'staff-cancel:' || new.id || ':' || extract(epoch from now())::bigint
      );
    end if;
    perform public._offer_waitlist(new.id);
  elsif new.status = 'no_show' then
    perform public._cancel_queued(new.id, array['booking_reminder']);
  elsif new.status = 'completed' then
    select * into v_auto from public._automation(new.salon_id, 'followup');
    if v_auto.enabled then
      perform public._notify_client(
        new.id, 'followup', 'followup:' || new.id,
        now() + make_interval(hours => coalesce((v_auto.config ->> 'hours_after')::int, 3))
      );
    end if;
    select * into v_auto from public._automation(new.salon_id, 'review_request');
    if v_auto.enabled and exists (select 1 from public.salons where id = new.salon_id and google_review_url is not null) then
      perform public._notify_client(
        new.id, 'review_request', 'review:' || new.id,
        now() + make_interval(hours => coalesce((v_auto.config ->> 'hours_after')::int, 24))
      );
    end if;
  end if;
  return new;
end
$$;

create trigger d_booking_notifications_hook after update of status on public.bookings
for each row when (old.status is distinct from new.status)
execute function public.booking_notifications_hook();

-- Scheduled scans
create function public.enqueue_return_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_auto record;
  v_count integer := 0;
  v_tolerance integer;
  v_second numeric;
  v_stage text;
  v_ref text;
  v_favorite text;
  v_rewards integer;
begin
  for v_row in
    select cs.*, c.first_name, s.name as salon_name, s.slug as salon_slug, s.id as sid
    from public.client_stats cs
    join public.clients c on c.id = cs.client_id
    join public.salons s on s.id = cs.salon_id
    where cs.next_expected_at is not null and cs.avg_interval_days is not null
      and c.anonymized_at is null and c.merged_into is null and s.archived_at is null and s.status <> 'suspended'
      and not exists (
        select 1 from public.bookings b
        where b.client_id = cs.client_id and b.status in ('pending', 'confirmed') and b.starts_at > now()
      )
  loop
    select * into v_auto from public._automation(v_row.sid, 'return_reminder');
    if not v_auto.enabled then
      continue;
    end if;
    v_tolerance := coalesce((v_auto.config ->> 'tolerance_days')::int, 3);
    v_second := coalesce((v_auto.config ->> 'second_factor')::numeric, 2);
    v_ref := v_row.client_id || ':' || v_row.last_visit_at::date;
    v_stage := null;
    if now() > v_row.next_expected_at + make_interval(days => v_tolerance)
       and not exists (select 1 from public.notifications where dedupe_key like 'return1:' || v_ref || ':%') then
      v_stage := 'return1';
    elsif now() > v_row.last_visit_at + make_interval(secs => (v_row.avg_interval_days * v_second * 86400)::int)
       and exists (select 1 from public.notifications where dedupe_key like 'return1:' || v_ref || ':%')
       and not exists (select 1 from public.notifications where dedupe_key like 'return2:' || v_ref || ':%') then
      v_stage := 'return2';
    end if;
    if v_stage is null then
      continue;
    end if;
    select name into v_favorite from public.services where id = v_row.favorite_service_id;
    select count(*)::int into v_rewards from public.loyalty_rewards
    where client_id = v_row.client_id and status = 'available' and (expires_at is null or expires_at > now());
    v_count := v_count + public._enqueue(
      v_row.sid, v_row.client_id, null, 'return_reminder', v_auto.channels, now(),
      v_stage || ':' || v_ref,
      jsonb_build_object(
        'stage', v_stage,
        'first_name', v_row.first_name,
        'salon', jsonb_build_object('name', v_row.salon_name, 'slug', v_row.salon_slug),
        'days_since_last_visit', extract(day from now() - v_row.last_visit_at)::int,
        'avg_interval_days', v_row.avg_interval_days,
        'favorite_service', v_favorite,
        'available_rewards', v_rewards
      ),
      true
    );
  end loop;
  return v_count;
end
$$;

create function public.enqueue_birthdays() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_auto record;
  v_count integer := 0;
begin
  for v_row in
    select c.id, c.first_name, c.salon_id, s.name as salon_name, s.slug as salon_slug, s.timezone
    from public.clients c join public.salons s on s.id = c.salon_id
    where c.birthday is not null and c.anonymized_at is null and c.merged_into is null
      and s.archived_at is null and s.status <> 'suspended'
      and to_char(c.birthday, 'MM-DD') = to_char(now() at time zone s.timezone, 'MM-DD')
  loop
    select * into v_auto from public._automation(v_row.salon_id, 'birthday');
    if not v_auto.enabled then
      continue;
    end if;
    v_count := v_count + public._enqueue(
      v_row.salon_id, v_row.id, null, 'birthday', v_auto.channels, now(),
      'birthday:' || v_row.id || ':' || extract(year from now())::int,
      jsonb_build_object(
        'first_name', v_row.first_name,
        'salon', jsonb_build_object('name', v_row.salon_name, 'slug', v_row.salon_slug),
        'offer', v_auto.config ->> 'offer'
      ),
      true
    );
  end loop;
  return v_count;
end
$$;

revoke execute on function public.enqueue_return_reminders() from public, anon, authenticated;
revoke execute on function public.enqueue_birthdays() from public, anon, authenticated;

-- Worker API
create function public.claim_notifications(p_limit integer default 50) returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications n
  set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
  where n.id in (
    select id from public.notifications
    where channel <> 'in_app'
      and ((status = 'queued' and scheduled_for <= now())
        or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  returning n.*
$$;

create function public.complete_notification(p_id uuid, p_provider_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n public.notifications;
begin
  update public.notifications
  set status = 'sent', sent_at = now(), provider_id = p_provider_id, last_error = null
  where id = p_id and status = 'sending'
  returning * into v_n;
  if found and v_n.channel = 'sms' then
    insert into public.sms_credits_ledger (salon_id, delta, reason, ref) values (v_n.salon_id, -1, 'sms_sent', v_n.id);
  end if;
end
$$;

create function public.fail_notification(p_id uuid, p_error text, p_permanent boolean default false) returns void
language sql security definer set search_path = '' as $$
  update public.notifications
  set status = case when p_permanent or attempts >= 5 then 'failed'::public.notification_status else 'queued'::public.notification_status end,
      last_error = left(p_error, 500),
      scheduled_for = now() + make_interval(mins => power(2, attempts)::int)
  where id = p_id and status = 'sending'
$$;

create function public.skip_notification(p_id uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set status = 'skipped', last_error = p_reason where id = p_id and status = 'sending'
$$;

revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
revoke execute on function public.complete_notification(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_notification(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.skip_notification(uuid, text) from public, anon, authenticated;

create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and channel = 'in_app' and read_at is null and (p_ids is null or id = any (p_ids))
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;

-- Policies
select public.apply_tenant_rls('public.automations',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.notification_templates',
  array['owner', 'manager', 'reception']::public.salon_role[],
  array['owner', 'manager']::public.salon_role[]);
select public.apply_tenant_rls('public.notifications',
  array['owner', 'manager']::public.salon_role[],
  null);
select public.apply_tenant_rls('public.sms_credits_ledger',
  array['owner', 'manager']::public.salon_role[],
  null);

create policy notifications_own_inbox on public.notifications for select to authenticated
  using (user_id = auth.uid() and channel = 'in_app');

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
