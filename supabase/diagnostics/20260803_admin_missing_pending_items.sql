-- 管理画面に出ない7月の承認待ち/経費を調べる診断SQLです。
-- Supabase SQL Editorでそのまま実行してください。
-- 結果に個人情報が含まれるため、共有する場合は必要に応じて伏せてください。

select
  'work_report_pending' as kind,
  wr.id as item_id,
  wr.approval_status as status,
  wr.created_at as item_created_at,
  r.id as reservation_id,
  r.scheduled_at,
  r.status as reservation_status,
  r.customer_name,
  r.service_content,
  p.display_name as staff_name
from public.work_reports wr
left join public.reservations r on r.id = wr.reservation_id
left join public.profiles p on p.id = wr.staff_id
where wr.approval_status = 'pending'
  and r.scheduled_at >= '2026-07-01T00:00:00+09:00'::timestamptz
  and r.scheduled_at < '2026-08-01T00:00:00+09:00'::timestamptz
order by r.scheduled_at desc, wr.created_at desc;

select
  'expense_requested' as kind,
  e.id as item_id,
  e.status,
  e.created_at as item_created_at,
  e.reservation_id as primary_reservation_id,
  coalesce(er.reservation_id, e.reservation_id) as linked_reservation_id,
  r.scheduled_at,
  r.status as reservation_status,
  r.customer_name,
  r.service_content,
  p.display_name as staff_name,
  e.amount,
  e.note
from public.expenses e
left join public.expense_reservations er on er.expense_id = e.id
left join public.reservations r on r.id = coalesce(er.reservation_id, e.reservation_id)
left join public.profiles p on p.id = e.staff_id
where e.status = 'requested'
  and (
    (
      r.scheduled_at >= '2026-07-01T00:00:00+09:00'::timestamptz
      and r.scheduled_at < '2026-08-01T00:00:00+09:00'::timestamptz
    )
    or (
      r.id is null
      and e.created_at >= '2026-07-01T00:00:00+09:00'::timestamptz
      and e.created_at < '2026-08-01T00:00:00+09:00'::timestamptz
    )
  )
order by coalesce(r.scheduled_at, e.created_at) desc, e.created_at desc;

select
  'admin_profile_check' as kind,
  auth.uid() as auth_uid,
  p.display_name,
  p.role,
  public.is_admin() as is_admin
from public.profiles p
where p.id = auth.uid();
