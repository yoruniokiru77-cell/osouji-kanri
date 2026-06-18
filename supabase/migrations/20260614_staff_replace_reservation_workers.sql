create or replace function public.replace_own_reservation_workers(
  target_reservation_id uuid,
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
begin
  select array_agg(distinct selected.worker_id)
  into normalized_worker_ids
  from unnest(target_worker_ids) as selected(worker_id);

  if coalesce(cardinality(normalized_worker_ids), 0) = 0 then
    raise exception 'Select at least one worker.';
  end if;

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

  select count(*)
  into valid_worker_count
  from public.workers w
  where w.id = any(normalized_worker_ids)
    and w.active;

  if valid_worker_count <> cardinality(normalized_worker_ids) then
    raise exception 'One or more selected workers are invalid.';
  end if;

  delete from public.reservation_workers
  where reservation_id = target_reservation_id;

  insert into public.reservation_workers (reservation_id, worker_id)
  select target_reservation_id, selected.worker_id
  from unnest(normalized_worker_ids) as selected(worker_id);
end;
$$;

revoke all on function public.replace_own_reservation_workers(uuid, uuid[]) from public;
grant execute on function public.replace_own_reservation_workers(uuid, uuid[]) to authenticated;
