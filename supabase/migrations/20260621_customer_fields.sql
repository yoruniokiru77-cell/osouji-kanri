alter table public.reservations
  add column if not exists customer_name text,
  add column if not exists customer_phone text;

drop function if exists public.update_own_scheduled_reservation(
  uuid, timestamptz, text, uuid, uuid, boolean, text, text, uuid[]
);

create function public.update_own_scheduled_reservation(
  target_reservation_id uuid,
  target_scheduled_at timestamptz,
  target_customer_name text,
  target_customer_phone text,
  target_address text,
  target_service_content_id uuid,
  target_service_category_id uuid,
  target_parking_available boolean,
  target_parking_notes text,
  target_notes text,
  target_worker_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_worker_ids uuid[];
  valid_worker_count integer;
  selected_content_name text;
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

  select sc.name
  into selected_content_name
  from public.service_contents sc
  where sc.id = target_service_content_id
    and sc.active;

  if selected_content_name is null then
    raise exception 'The selected service content is invalid.';
  end if;

  if not exists (
    select 1
    from public.service_categories sc
    where sc.id = target_service_category_id
      and sc.active
  ) then
    raise exception 'The selected category is invalid.';
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

  update public.reservations
  set scheduled_at = target_scheduled_at,
      customer_name = nullif(trim(target_customer_name), ''),
      customer_phone = nullif(trim(target_customer_phone), ''),
      address = trim(target_address),
      service_content = selected_content_name,
      service_content_id = target_service_content_id,
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
end;
$$;

revoke all on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, uuid, uuid, boolean, text, text, uuid[]
) from public;

grant execute on function public.update_own_scheduled_reservation(
  uuid, timestamptz, text, text, text, uuid, uuid, boolean, text, text, uuid[]
) to authenticated;
