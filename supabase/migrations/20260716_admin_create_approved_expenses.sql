drop policy if exists "admins create approved expenses" on public.expenses;
create policy "admins create approved expenses"
on public.expenses for insert
to authenticated
with check (
  public.is_admin()
  and status = 'approved'
  and reviewed_by = auth.uid()
  and reviewed_at is not null
);
