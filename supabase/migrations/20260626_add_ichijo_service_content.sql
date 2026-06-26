insert into public.service_contents (name, active)
values ('一条', true)
on conflict (name) do update
set active = true;
