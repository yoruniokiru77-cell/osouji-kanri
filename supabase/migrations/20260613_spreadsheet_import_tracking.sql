alter table public.reservations
  add column if not exists source_system text,
  add column if not exists source_key text;

create unique index if not exists reservations_source_unique
  on public.reservations (source_system, source_key)
  where source_system is not null and source_key is not null;
