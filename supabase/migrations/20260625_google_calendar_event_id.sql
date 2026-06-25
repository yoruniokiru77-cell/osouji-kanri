alter table public.reservations
  add column if not exists google_calendar_event_id text;
