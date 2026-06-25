alter table public.reservations
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create or replace function public.cancel_own_scheduled_reservation(
  target_reservation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.reservations r
    where r.id = target_reservation_id
      and r.status = 'scheduled'
      and (
        r.created_by = auth.uid()
        or exists (
          select 1
          from public.reservation_staff rs
          where rs.reservation_id = r.id
            and rs.staff_id = auth.uid()
        )
      )
  ) then
    raise exception 'This reservation cannot be deleted.';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = target_reservation_id;
end;
$$;

revoke all on function public.cancel_own_scheduled_reservation(uuid) from public;
grant execute on function public.cancel_own_scheduled_reservation(uuid) to authenticated;
