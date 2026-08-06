insert into storage.buckets (id, name, public)
values ('brand-photos', 'brand-photos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "authenticated users can read brand photos" on storage.objects;
create policy "authenticated users can read brand photos"
on storage.objects for select
to authenticated
using (bucket_id = 'brand-photos');

drop policy if exists "staff upload own brand photos" on storage.objects;
create policy "staff upload own brand photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'brand-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "staff update own brand photos" on storage.objects;
create policy "staff update own brand photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'brand-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'brand-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
