create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists service_category_id uuid
  references public.service_categories(id) on delete restrict;

drop trigger if exists touch_service_categories_updated_at on public.service_categories;
create trigger touch_service_categories_updated_at
before update on public.service_categories
for each row execute function public.touch_updated_at();

alter table public.service_categories enable row level security;

drop policy if exists "service categories are visible" on public.service_categories;
create policy "service categories are visible"
on public.service_categories for select
to authenticated
using (active or public.is_admin());

drop policy if exists "admins manage service categories" on public.service_categories;
create policy "admins manage service categories"
on public.service_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.service_categories (name)
select convert_from(decode(value, 'hex'), 'UTF8')
from unnest(array[
  'e79bb4e6a188e4bbb6',
  'e4b880e69da1e6a188e4bbb6',
  'e6b0b4e688b8e9a785e58d97e5ba97',
  'e38396e383a9e383b3e38389e6a188e4bbb6',
  'e7a78be5b1b1e7be8ee8a385',
  'e3838de382afe382b9e38388e382a2e38389e38390e383b3e382b9',
  'e3819de381aee4bb96'
]) as value
on conflict (name) do nothing;

update public.reservations r
set service_category_id = c.id
from public.service_categories c
where r.service_category_id is null
  and (
    r.service_content = c.name
    or r.service_content like c.name || ' /%'
  );

update public.reservations r
set service_category_id = c.id
from public.service_categories c
where r.service_category_id is null
  and c.name = convert_from(decode('e3819de381aee4bb96', 'hex'), 'UTF8');
