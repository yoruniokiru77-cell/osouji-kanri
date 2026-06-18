do $$
begin
  create type public.reservation_status as enum (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.reservations
  add column if not exists status public.reservation_status not null default 'scheduled';

alter table public.reservation_staff
  add column if not exists commission_rate_override numeric(5, 4);

alter table public.expenses
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

drop policy if exists "staff update own work reports" on public.work_reports;
create policy "staff update own work reports"
on public.work_reports for update
to authenticated
using (staff_id = auth.uid())
with check (
  staff_id = auth.uid()
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = work_reports.reservation_id
      and rs.staff_id = auth.uid()
  )
);
