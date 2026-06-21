create table if not exists public.staff_cash_balances (
  staff_id uuid primary key references public.profiles(id) on delete cascade,
  change_amount numeric(12, 0) not null default 0 check (change_amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.staff_cash_balances enable row level security;

drop policy if exists "staff see own cash balance and admins see all" on public.staff_cash_balances;
create policy "staff see own cash balance and admins see all"
on public.staff_cash_balances for select
to authenticated
using (staff_id = auth.uid() or public.is_admin());

drop policy if exists "staff update own cash balance" on public.staff_cash_balances;
create policy "staff update own cash balance"
on public.staff_cash_balances for insert
to authenticated
with check (staff_id = auth.uid() or public.is_admin());

drop policy if exists "staff modify own cash balance" on public.staff_cash_balances;
create policy "staff modify own cash balance"
on public.staff_cash_balances for update
to authenticated
using (staff_id = auth.uid() or public.is_admin())
with check (staff_id = auth.uid() or public.is_admin());

drop trigger if exists touch_staff_cash_balances_updated_at on public.staff_cash_balances;
create trigger touch_staff_cash_balances_updated_at
before update on public.staff_cash_balances
for each row execute function public.touch_updated_at();
