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
values
  ('直案件'),
  ('一条案件'),
  ('水戸駅南店'),
  ('ブランド案件'),
  ('秋山美装'),
  ('ネクストアドバンス'),
  ('その他')
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
  and c.name = 'その他';
