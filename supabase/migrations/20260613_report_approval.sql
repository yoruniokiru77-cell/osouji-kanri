do $$
begin
  create type public.report_approval_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

alter table public.work_reports
  add column if not exists reported_amount numeric(12, 0) not null default 0
    check (reported_amount >= 0),
  add column if not exists approval_status public.report_approval_status not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

drop policy if exists "staff create reservations" on public.reservations;
create policy "staff create reservations"
on public.reservations for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and amount = 0
  and status = 'scheduled'
);

drop policy if exists "staff assign themselves to reservations" on public.reservation_staff;
create policy "staff assign themselves to reservations"
on public.reservation_staff for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and staff_id = auth.uid()
);

drop policy if exists "staff attach tools to own reservations" on public.reservation_tools;
create policy "staff attach tools to own reservations"
on public.reservation_tools for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_tools.reservation_id
      and rs.staff_id = auth.uid()
  )
);

create or replace function public.approve_work_report(report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report public.work_reports;
begin
  if not public.is_admin() then
    raise exception '管理者権限が必要です';
  end if;

  select * into target_report
  from public.work_reports
  where id = report_id
  for update;

  if target_report.id is null then
    raise exception '報告が見つかりません';
  end if;

  if target_report.reported_amount <= 0 then
    raise exception '売上金額が入力されていません';
  end if;

  update public.work_reports
  set approval_status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = report_id;

  update public.reservations
  set amount = target_report.reported_amount,
      status = 'completed'
  where id = target_report.reservation_id;
end;
$$;

grant execute on function public.approve_work_report(uuid) to authenticated;
