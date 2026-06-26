create extension if not exists "pgcrypto";

do $$
begin
  create type public.user_role as enum ('admin', 'staff');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.expense_status as enum ('requested', 'approved', 'purchased', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.reservation_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_approval_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.user_role not null default 'staff',
  commission_rate numeric(5, 4) not null default 0.5,
  created_at timestamptz not null default now()
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  scheduled_at timestamptz not null,
  customer_name text,
  customer_phone text,
  address text not null,
  amount numeric(12, 0) not null check (amount >= 0),
  service_content text not null,
  service_category_id uuid references public.service_categories(id) on delete restrict,
  parking_available boolean not null default false,
  parking_notes text,
  notes text,
  google_calendar_event_id text,
  source_system text,
  source_key text,
  status public.reservation_status not null default 'scheduled',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists reservations_source_unique
  on public.reservations (source_system, source_key)
  where source_system is not null and source_key is not null;

create table if not exists public.reservation_staff (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  commission_rate_override numeric(5, 4),
  primary key (reservation_id, staff_id)
);

create table if not exists public.reservation_tools (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete restrict,
  primary key (reservation_id, tool_id)
);

create table if not exists public.work_reports (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  report_text text not null,
  issues text,
  customer_review text,
  notes text,
  reported_amount numeric(12, 0) not null default 0 check (reported_amount >= 0),
  payment_method text not null default 'other'
    check (payment_method in ('cash', 'card', 'invoice', 'other')),
  card_statement_url text,
  previous_change_amount numeric(12, 0),
  change_amount numeric(12, 0),
  cash_collected_amount numeric(12, 0),
  approval_status public.report_approval_status not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, staff_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete set null,
  amount numeric(12, 0) not null check (amount >= 0),
  note text,
  status public.expense_status not null default 'requested',
  receipt_url text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchased_expenses_need_receipt check (
    status <> 'purchased' or receipt_url is not null
  )
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_work_reports_updated_at on public.work_reports;
create trigger touch_work_reports_updated_at
before update on public.work_reports
for each row execute function public.touch_updated_at();

drop trigger if exists touch_expenses_updated_at on public.expenses;
create trigger touch_expenses_updated_at
before update on public.expenses
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
$$;

alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.expense_categories enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_staff enable row level security;
alter table public.reservation_tools enable row level security;
alter table public.work_reports enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "profiles are visible to authenticated users" on public.profiles;
create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users create own staff profile" on public.profiles;
create policy "users create own staff profile"
on public.profiles for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'staff'
);

drop policy if exists "masters are visible" on public.tools;
create policy "masters are visible"
on public.tools for select
to authenticated
using (true);

drop policy if exists "admins manage tools" on public.tools;
create policy "admins manage tools"
on public.tools for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "expense categories are visible" on public.expense_categories;
create policy "expense categories are visible"
on public.expense_categories for select
to authenticated
using (true);

drop policy if exists "admins manage expense categories" on public.expense_categories;
create policy "admins manage expense categories"
on public.expense_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins see all reservations and staff see assigned reservations" on public.reservations;
create policy "admins see all reservations and staff see assigned reservations"
on public.reservations for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservations.id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "admins manage reservations" on public.reservations;
create policy "admins manage reservations"
on public.reservations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff create reservations" on public.reservations;
create policy "staff create reservations"
on public.reservations for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and amount = 0
  and status = 'scheduled'
);

drop policy if exists "staff update own scheduled reservations" on public.reservations;
create policy "staff update own scheduled reservations"
on public.reservations for update
to authenticated
using (
  public.current_user_role() = 'staff'
  and status = 'scheduled'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservations.id
      and rs.staff_id = auth.uid()
  )
)
with check (
  amount = 0
  and status = 'scheduled'
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservations.id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "reservation staff visible to relevant users" on public.reservation_staff;
create policy "reservation staff visible to relevant users"
on public.reservation_staff for select
to authenticated
using (public.is_admin() or staff_id = auth.uid());

drop policy if exists "admins manage reservation staff" on public.reservation_staff;
create policy "admins manage reservation staff"
on public.reservation_staff for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff assign themselves to reservations" on public.reservation_staff;
create policy "staff assign themselves to reservations"
on public.reservation_staff for insert
to authenticated
with check (
  public.current_user_role() = 'staff'
  and staff_id = auth.uid()
);

drop policy if exists "reservation tools visible to relevant users" on public.reservation_tools;
create policy "reservation tools visible to relevant users"
on public.reservation_tools for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = reservation_tools.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "admins manage reservation tools" on public.reservation_tools;
create policy "admins manage reservation tools"
on public.reservation_tools for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

drop policy if exists "work reports visible to admin or owner" on public.work_reports;
create policy "work reports visible to admin or owner"
on public.work_reports for select
to authenticated
using (public.is_admin() or staff_id = auth.uid());

drop policy if exists "staff insert own work reports" on public.work_reports;
create policy "staff insert own work reports"
on public.work_reports for insert
to authenticated
with check (
  staff_id = auth.uid()
  and exists (
    select 1
    from public.reservation_staff rs
    where rs.reservation_id = work_reports.reservation_id
      and rs.staff_id = auth.uid()
  )
);

drop policy if exists "staff update own work reports" on public.work_reports;
create policy "staff update own work reports"
on public.work_reports for update
to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid());

drop policy if exists "expenses visible to admin or owner" on public.expenses;
create policy "expenses visible to admin or owner"
on public.expenses for select
to authenticated
using (public.is_admin() or staff_id = auth.uid());

drop policy if exists "staff create own expenses" on public.expenses;
create policy "staff create own expenses"
on public.expenses for insert
to authenticated
with check (staff_id = auth.uid() and status = 'requested' and receipt_url is null);

drop policy if exists "admins update expenses" on public.expenses;
create policy "admins update expenses"
on public.expenses for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.tools (name)
values
  ('高圧洗浄機'),
  ('脚立'),
  ('養生シート'),
  ('エアコン洗浄カバー'),
  ('掃除機')
on conflict (name) do nothing;

insert into public.expense_categories (name)
values
  ('駐車場代'),
  ('洗剤代'),
  ('消耗品'),
  ('交通費'),
  ('道具購入'),
  ('その他')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated users can read receipts" on storage.objects;
create policy "authenticated users can read receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts');

drop policy if exists "admins upload receipts" on storage.objects;
create policy "admins upload receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts' and public.is_admin());

drop policy if exists "admins update receipts" on storage.objects;
create policy "admins update receipts"
on storage.objects for update
to authenticated
using (bucket_id = 'receipts' and public.is_admin())
with check (bucket_id = 'receipts' and public.is_admin());

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
