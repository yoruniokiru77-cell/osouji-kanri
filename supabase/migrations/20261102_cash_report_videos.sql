alter table public.work_reports
  add column if not exists cash_video_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cash-videos',
  'cash-videos',
  false,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "relevant users can read cash videos" on storage.objects;
create policy "relevant users can read cash videos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'cash-videos'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "staff upload own cash videos" on storage.objects;
create policy "staff upload own cash videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cash-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "staff update own cash videos" on storage.objects;
create policy "staff update own cash videos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'cash-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'cash-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';
