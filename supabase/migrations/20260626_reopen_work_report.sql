create or replace function public.reopen_work_report(report_id uuid)
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

  if target_report.approval_status <> 'approved' then
    raise exception '承認済みの報告ではありません';
  end if;

  update public.work_reports
  set approval_status = 'pending',
      reviewed_at = null,
      reviewed_by = null
  where id = report_id;

  update public.reservations
  set amount = 0,
      status = 'scheduled'
  where id = target_report.reservation_id;
end;
$$;

grant execute on function public.reopen_work_report(uuid) to authenticated;
