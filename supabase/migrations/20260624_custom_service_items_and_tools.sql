alter table public.reservation_service_contents
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists custom_name text;

update public.reservation_service_contents
set id = gen_random_uuid()
where id is null;

alter table public.reservation_service_contents
  drop constraint if exists reservation_service_contents_pkey;

alter table public.reservation_service_contents
  alter column id set not null;

alter table public.reservation_service_contents
  add constraint reservation_service_contents_pkey primary key (id);

alter table public.reservation_service_contents
  alter column service_content_id drop not null;

drop index if exists reservation_service_contents_reservation_content_idx;
create unique index reservation_service_contents_reservation_content_idx
on public.reservation_service_contents (reservation_id, service_content_id)
where service_content_id is not null;

alter table public.reservation_service_contents
  drop constraint if exists reservation_service_contents_content_or_custom_check;

alter table public.reservation_service_contents
  add constraint reservation_service_contents_content_or_custom_check
  check (
    service_content_id is not null
    or nullif(trim(custom_name), '') is not null
  );

create table if not exists public.reservation_custom_tools (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  name text not null check (nullif(trim(name), '') is not null),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.reservation_custom_tools enable row level security;

drop policy if exists "reservation custom tools visible to relevant users" on public.reservation_custom_tools;
create policy "reservation custom tools visible to relevant users"
on public.reservation_custom_tools for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_custom_tools.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "admins manage reservation custom tools" on public.reservation_custom_tools;
create policy "admins manage reservation custom tools"
on public.reservation_custom_tools for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff attach custom tools to own reservations" on public.reservation_custom_tools;
create policy "staff attach custom tools to own reservations"
on public.reservation_custom_tools for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_custom_tools.reservation_id
      and rs.staff_id = auth.uid()
  )
);

insert into public.service_contents (name, active)
values
  ('エアコン一般', true),
  ('エアコンロボ', true),
  ('エアコン天埋1方向', true),
  ('エアコン天埋4方向', true),
  ('室外機', true),
  ('浴室', true),
  ('キッチン', true),
  ('レンジフード', true),
  ('水回り2点セット', true),
  ('洗面所', true),
  ('トイレ', true),
  ('マック清掃', true),
  ('つくばイオン', true)
on conflict (name) do update set active = true;

update public.service_contents
set active = false
where name not in (
  'エアコン一般',
  'エアコンロボ',
  'エアコン天埋1方向',
  'エアコン天埋4方向',
  '室外機',
  '浴室',
  'キッチン',
  'レンジフード',
  '水回り2点セット',
  '洗面所',
  'トイレ',
  'マック清掃',
  'つくばイオン'
);

create or replace function public.update_own_scheduled_reservation(
  target_reservation_id uuid,
  target_scheduled_at timestamptz,
  target_customer_name text,
  target_customer_phone text,
  target_address text,
  target_service_items jsonb,
  target_service_category_id uuid,
  target_parking_available boolean,
  target_parking_notes text,
  target_notes text,
  target_worker_ids uuid[],
  target_tool_ids uuid[] default array[]::uuid[],
  target_custom_tool_names text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_worker_ids uuid[];
  normalized_tool_ids uuid[];
  valid_worker_count integer;
  valid_tool_count integer;
  valid_service_count integer;
  selected_content_name text;
  first_service_content_id uuid;
begin
  if not exists (
    select 1
    from public.reservations r
    join public.reservation_staff rs on rs.reservation_id = r.id
    where r.id = target_reservation_id
      and r.status = 'scheduled'
      and rs.staff_id = auth.uid()
  ) then
    raise exception 'This reservation cannot be edited.';
  end if;

  if target_scheduled_at is null or nullif(trim(target_address), '') is null then
    raise exception 'Required reservation fields are missing.';
  end if;

  if not exists (
    select 1
    from public.service_categories sc
    where sc.id = target_service_category_id
      and sc.active
  ) then
    raise exception 'The selected category is invalid.';
  end if;

  create temporary table selected_service_items (
    service_content_id uuid,
    custom_name text,
    quantity integer not null,
    sort_order integer not null
  ) on commit drop;

  insert into selected_service_items (service_content_id, custom_name, quantity, sort_order)
  select
    nullif(item.value ->> 'service_content_id', '')::uuid,
    nullif(trim(coalesce(item.value ->> 'custom_name', '')), ''),
    greatest(coalesce((item.value ->> 'quantity')::integer, 1), 1),
    coalesce((item.value ->> 'sort_order')::integer, item.ordinality::integer - 1)
  from jsonb_array_elements(coalesce(target_service_items, '[]'::jsonb)) with ordinality as item(value, ordinality)
  where nullif(item.value ->> 'service_content_id', '') is not null
     or nullif(trim(coalesce(item.value ->> 'custom_name', '')), '') is not null;

  if not exists (select 1 from selected_service_items) then
    raise exception 'Select at least one service content.';
  end if;

  select count(*)
  into valid_service_count
  from public.service_contents sc
  join selected_service_items selected on selected.service_content_id = sc.id
  where sc.active;

  if valid_service_count <> (
    select count(*) from selected_service_items where service_content_id is not null
  ) then
    raise exception 'One or more selected service contents are invalid.';
  end if;

  select selected.service_content_id
  into first_service_content_id
  from selected_service_items selected
  where selected.service_content_id is not null
  order by selected.sort_order
  limit 1;

  select string_agg(
    coalesce(sc.name, selected.custom_name) ||
      case when selected.quantity > 1 then ' x' || selected.quantity::text else '' end,
    '、' order by selected.sort_order
  )
  into selected_content_name
  from selected_service_items selected
  left join public.service_contents sc on sc.id = selected.service_content_id;

  select array_agg(distinct selected.worker_id)
  into normalized_worker_ids
  from unnest(target_worker_ids) as selected(worker_id);

  if coalesce(cardinality(normalized_worker_ids), 0) = 0 then
    raise exception 'Select at least one worker.';
  end if;

  select count(*)
  into valid_worker_count
  from public.workers w
  where w.id = any(normalized_worker_ids)
    and w.active;

  if valid_worker_count <> cardinality(normalized_worker_ids) then
    raise exception 'One or more selected workers are invalid.';
  end if;

  select array_agg(distinct selected.tool_id)
  into normalized_tool_ids
  from unnest(coalesce(target_tool_ids, array[]::uuid[])) as selected(tool_id);

  if coalesce(cardinality(normalized_tool_ids), 0) > 0 then
    select count(*)
    into valid_tool_count
    from public.tools t
    where t.id = any(normalized_tool_ids);

    if valid_tool_count <> cardinality(normalized_tool_ids) then
      raise exception 'One or more selected tools are invalid.';
    end if;
  end if;

  update public.reservations
  set scheduled_at = target_scheduled_at,
      customer_name = nullif(trim(target_customer_name), ''),
      customer_phone = nullif(trim(target_customer_phone), ''),
      address = trim(target_address),
      service_content = selected_content_name,
      service_content_id = first_service_content_id,
      service_category_id = target_service_category_id,
      parking_available = target_parking_available,
      parking_notes = nullif(trim(target_parking_notes), ''),
      notes = nullif(trim(target_notes), '')
  where id = target_reservation_id;

  delete from public.reservation_workers
  where reservation_id = target_reservation_id;

  insert into public.reservation_workers (reservation_id, worker_id)
  select target_reservation_id, selected.worker_id
  from unnest(normalized_worker_ids) as selected(worker_id);

  delete from public.reservation_service_contents
  where reservation_id = target_reservation_id;

  insert into public.reservation_service_contents (
    reservation_id,
    service_content_id,
    custom_name,
    quantity,
    sort_order
  )
  select
    target_reservation_id,
    selected.service_content_id,
    selected.custom_name,
    selected.quantity,
    selected.sort_order
  from selected_service_items selected;

  delete from public.reservation_tools
  where reservation_id = target_reservation_id;

  insert into public.reservation_tools (reservation_id, tool_id)
  select target_reservation_id, selected.tool_id
  from unnest(coalesce(normalized_tool_ids, array[]::uuid[])) as selected(tool_id);

  delete from public.reservation_custom_tools
  where reservation_id = target_reservation_id;

  insert into public.reservation_custom_tools (reservation_id, name, sort_order)
  select target_reservation_id, selected.name, selected.sort_order
  from (
    select distinct on (trim(name))
      trim(name) as name,
      ordinality::integer - 1 as sort_order
    from unnest(coalesce(target_custom_tool_names, array[]::text[])) with ordinality as input(name, ordinality)
    where nullif(trim(name), '') is not null
    order by trim(name), ordinality
  ) selected
  order by selected.sort_order;
end;
$$;

revoke all on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, jsonb, uuid, boolean, text, text, uuid[], uuid[], text[]
) from public;

grant execute on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, jsonb, uuid, boolean, text, text, uuid[], uuid[], text[]
) to authenticated;
