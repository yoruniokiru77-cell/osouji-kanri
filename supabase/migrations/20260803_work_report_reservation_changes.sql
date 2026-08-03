alter table public.work_reports
  add column if not exists reservation_original_snapshot jsonb,
  add column if not exists reservation_reported_changes jsonb;
