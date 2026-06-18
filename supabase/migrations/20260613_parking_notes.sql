alter table public.reservations
  add column if not exists parking_notes text;
