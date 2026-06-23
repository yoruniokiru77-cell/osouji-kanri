create table if not exists public.service_content_tools (
  service_content_id uuid not null references public.service_contents(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  primary key (service_content_id, tool_id)
);

create table if not exists public.reservation_service_contents (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  service_content_id uuid not null references public.service_contents(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  primary key (reservation_id, service_content_id)
);

alter table public.service_content_tools enable row level security;
alter table public.reservation_service_contents enable row level security;

drop policy if exists "service content tools are visible" on public.service_content_tools;
create policy "service content tools are visible"
on public.service_content_tools for select
to authenticated
using (true);

drop policy if exists "admins manage service content tools" on public.service_content_tools;
create policy "admins manage service content tools"
on public.service_content_tools for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reservation service contents visible to relevant users" on public.reservation_service_contents;
create policy "reservation service contents visible to relevant users"
on public.reservation_service_contents for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_service_contents.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "admins manage reservation service contents" on public.reservation_service_contents;
create policy "admins manage reservation service contents"
on public.reservation_service_contents for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff attach service contents to own reservations" on public.reservation_service_contents;
create policy "staff attach service contents to own reservations"
on public.reservation_service_contents for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_service_contents.reservation_id
      and rs.staff_id = auth.uid()
  )
);

insert into public.reservation_service_contents (reservation_id, service_content_id, quantity, sort_order)
select r.id, r.service_content_id, 1, 0
from public.reservations r
where r.service_content_id is not null
on conflict (reservation_id, service_content_id) do nothing;

drop function if exists public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, uuid, uuid, boolean, text, text, uuid[]
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
  target_tool_ids uuid[] default array[]::uuid[]
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
    service_content_id uuid primary key,
    quantity integer not null,
    sort_order integer not null
  ) on commit drop;

  insert into selected_service_items (service_content_id, quantity, sort_order)
  select
    parsed.service_content_id,
    sum(parsed.quantity)::integer,
    min(parsed.sort_order)::integer
  from (
    select
      (item.value ->> 'service_content_id')::uuid as service_content_id,
      greatest(coalesce((item.value ->> 'quantity')::integer, 1), 1) as quantity,
      coalesce((item.value ->> 'sort_order')::integer, item.ordinality::integer - 1) as sort_order
    from jsonb_array_elements(coalesce(target_service_items, '[]'::jsonb)) with ordinality as item(value, ordinality)
    where nullif(item.value ->> 'service_content_id', '') is not null
  ) parsed
  group by parsed.service_content_id;

  if not exists (select 1 from selected_service_items) then
    raise exception 'Select at least one service content.';
  end if;

  select count(*)
  into valid_service_count
  from public.service_contents sc
  join selected_service_items selected on selected.service_content_id = sc.id
  where sc.active;

  if valid_service_count <> (select count(*) from selected_service_items) then
    raise exception 'One or more selected service contents are invalid.';
  end if;

  select selected.service_content_id
  into first_service_content_id
  from selected_service_items selected
  order by selected.sort_order
  limit 1;

  select string_agg(
    sc.name || case when selected.quantity > 1 then ' x' || selected.quantity::text else '' end,
    '、' order by selected.sort_order
  )
  into selected_content_name
  from selected_service_items selected
  join public.service_contents sc on sc.id = selected.service_content_id;

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
    quantity,
    sort_order
  )
  select
    target_reservation_id,
    selected.service_content_id,
    selected.quantity,
    selected.sort_order
  from selected_service_items selected;

  delete from public.reservation_tools
  where reservation_id = target_reservation_id;

  insert into public.reservation_tools (reservation_id, tool_id)
  select target_reservation_id, selected.tool_id
  from unnest(coalesce(normalized_tool_ids, array[]::uuid[])) as selected(tool_id);
end;
$$;

revoke all on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, jsonb, uuid, boolean, text, text, uuid[], uuid[]
) from public;

grant execute on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, jsonb, uuid, boolean, text, text, uuid[], uuid[]
) to authenticated;
