drop policy if exists "work reports visible to admin or owner" on public.work_reports;
create policy "work reports visible to admin or owner"
on public.work_reports for select
to authenticated
using (public.is_admin() or staff_id = auth.uid());

drop policy if exists "expenses visible to admin or owner" on public.expenses;
create policy "expenses visible to admin or owner"
on public.expenses for select
to authenticated
using (public.is_admin() or staff_id = auth.uid());

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

notify pgrst, 'reload schema';
