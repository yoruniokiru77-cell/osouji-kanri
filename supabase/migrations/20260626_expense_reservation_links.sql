create table if not exists public.expense_reservations (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (expense_id, reservation_id)
);

alter table public.expense_reservations enable row level security;

drop policy if exists "staff create own expenses" on public.expenses;
create policy "staff create own expenses"
on public.expenses for insert
to authenticated
with check (staff_id = auth.uid() and status = 'requested');

drop policy if exists "expense reservation links visible to relevant users" on public.expense_reservations;
create policy "expense reservation links visible to relevant users"
on public.expense_reservations for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.expenses e
    where e.id = expense_reservations.expense_id
      and e.staff_id = auth.uid()
  )
);

drop policy if exists "staff link own expenses to reservations" on public.expense_reservations;
create policy "staff link own expenses to reservations"
on public.expense_reservations for insert
to authenticated
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_reservations.expense_id
      and e.staff_id = auth.uid()
      and e.status = 'requested'
  )
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = expense_reservations.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "admins manage expense reservation links" on public.expense_reservations;
create policy "admins manage expense reservation links"
on public.expense_reservations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
