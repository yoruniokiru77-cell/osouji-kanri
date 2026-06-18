do $$
begin
  create type public.worker_type as enum ('employee', 'contractor');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.compensation_type as enum ('percentage', 'fixed');
exception
  when duplicate_object then null;
end $$;

alter table public.reservations
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  worker_type public.worker_type not null default 'employee',
  default_compensation_type public.compensation_type not null default 'percentage',
  default_compensation_value numeric(12, 2) not null default 50,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_compensation_non_negative check (default_compensation_value >= 0)
);

create table if not exists public.reservation_workers (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  compensation_type public.compensation_type,
  compensation_value numeric(12, 2),
  primary key (reservation_id, worker_id),
  constraint assignment_compensation_non_negative check (
    compensation_value is null or compensation_value >= 0
  )
);

drop trigger if exists touch_workers_updated_at on public.workers;
create trigger touch_workers_updated_at
before update on public.workers
for each row execute function public.touch_updated_at();

alter table public.workers enable row level security;
alter table public.reservation_workers enable row level security;

drop policy if exists "authenticated users see active workers" on public.workers;
create policy "authenticated users see active workers"
on public.workers for select
to authenticated
using (active or public.is_admin());

drop policy if exists "admins manage workers" on public.workers;
create policy "admins manage workers"
on public.workers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "relevant users see reservation workers" on public.reservation_workers;
create policy "relevant users see reservation workers"
on public.reservation_workers for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_workers.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "staff assign workers to own reservations" on public.reservation_workers;
create policy "staff assign workers to own reservations"
on public.reservation_workers for insert
to authenticated
with check (
  exists (
    select 1
    from public.reservations r
    where r.id = reservation_workers.reservation_id
      and r.created_by = auth.uid()
  )
);

drop policy if exists "admins manage reservation workers" on public.reservation_workers;
create policy "admins manage reservation workers"
on public.reservation_workers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.workers (
  profile_id,
  name,
  worker_type,
  default_compensation_type,
  default_compensation_value
)
select
  p.id,
  p.display_name,
  'employee',
  'percentage',
  p.commission_rate * 100
from public.profiles p
where p.role = 'staff'
on conflict (profile_id) do update
set name = excluded.name;

insert into public.reservation_workers (reservation_id, worker_id)
select rs.reservation_id, w.id
from public.reservation_staff rs
join public.workers w on w.profile_id = rs.staff_id
on conflict (reservation_id, worker_id) do nothing;
