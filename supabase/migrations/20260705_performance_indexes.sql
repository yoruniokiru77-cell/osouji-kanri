create index if not exists reservations_scheduled_at_idx
  on public.reservations (scheduled_at);

create index if not exists reservations_created_by_idx
  on public.reservations (created_by);

create index if not exists reservation_staff_staff_id_idx
  on public.reservation_staff (staff_id);

create index if not exists reservation_workers_worker_id_idx
  on public.reservation_workers (worker_id);

create index if not exists work_reports_staff_created_at_idx
  on public.work_reports (staff_id, created_at desc);

create index if not exists work_reports_approval_status_idx
  on public.work_reports (approval_status);

create index if not exists expenses_created_at_idx
  on public.expenses (created_at);

create index if not exists expenses_staff_created_at_idx
  on public.expenses (staff_id, created_at desc);

create index if not exists expenses_status_idx
  on public.expenses (status);

create index if not exists expense_reservations_reservation_id_idx
  on public.expense_reservations (reservation_id);
