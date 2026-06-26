create or replace function public.approve_work_report(report_id uuid, approved_amount numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report public.work_reports;
  final_amount numeric(12, 0);
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

  final_amount := coalesce(approved_amount, target_report.reported_amount);

  if final_amount < 0 then
    raise exception '売上金額は0円以上で入力してください';
  end if;

  update public.work_reports
  set reported_amount = final_amount,
      approval_status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = report_id;

  update public.reservations
  set amount = final_amount,
      status = 'completed'
  where id = target_report.reservation_id;
end;
$$;

grant execute on function public.approve_work_report(uuid, numeric) to authenticated;
