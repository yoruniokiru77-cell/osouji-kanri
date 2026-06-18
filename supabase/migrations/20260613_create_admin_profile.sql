insert into public.profiles (
  id,
  display_name,
  role,
  commission_rate
)
select
  id,
  '管理者',
  'admin',
  0.5
from auth.users
where email = 'ADMIN_EMAIL@example.com'
on conflict (id) do update
set
  display_name = excluded.display_name,
  role = 'admin';
