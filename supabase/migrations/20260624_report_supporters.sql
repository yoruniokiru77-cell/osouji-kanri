create or replace function public.replace_own_reservation_workers(
  target_reservation_id uuid,
  target_worker_ids uuid[],
  target_custom_supporters jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_worker_ids uuid[];
  valid_worker_count integer;
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

  create temporary table selected_custom_supporters (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    amount numeric(12, 2) not null,
    sort_order integer not null
  ) on commit drop;

  insert into selected_custom_supporters (name, amount, sort_order)
  select
    trim(item.value ->> 'name'),
    (item.value ->> 'amount')::numeric,
    item.ordinality::integer - 1
  from jsonb_array_elements(coalesce(target_custom_supporters, '[]'::jsonb)) with ordinality as item(value, ordinality)
  where nullif(trim(item.value ->> 'name'), '') is not null;

  if exists (
    select 1
    from selected_custom_supporters
    where amount <= 0
  ) then
    raise exception 'Custom supporter amount must be greater than zero.';
  end if;

  delete from public.reservation_workers
  where reservation_id = target_reservation_id;

  insert into public.reservation_workers (reservation_id, worker_id)
  select target_reservation_id, selected.worker_id
  from unnest(normalized_worker_ids) as selected(worker_id);

  insert into public.workers (
    id,
    name,
    worker_type,
    default_compensation_type,
    default_compensation_value,
    active
  )
  select
    selected.id,
    selected.name,
    'contractor',
    'fixed',
    selected.amount,
    false
  from selected_custom_supporters selected;

  insert into public.reservation_workers (
    reservation_id,
    worker_id,
    compensation_type,
    compensation_value
  )
  select
    target_reservation_id,
    selected.id,
    'fixed',
    selected.amount
  from selected_custom_supporters selected;
end;
$$;

revoke all on function public.replace_own_reservation_workers(uuid, uuid[], jsonb) from public;
grant execute on function public.replace_own_reservation_workers(uuid, uuid[], jsonb) to authenticated;
