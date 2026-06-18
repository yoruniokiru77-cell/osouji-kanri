drop policy if exists "staff update own scheduled reservations" on public.reservations;
create policy "staff update own scheduled reservations"
on public.reservations for update
to authenticated
using (
  public.current_user_role() = 'staff'
  and status = 'scheduled'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservations.id
      and rs.staff_id = auth.uid()
  )
)
with check (
  amount = 0
  and status = 'scheduled'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservations.id
      and rs.staff_id = auth.uid()
  )
);
