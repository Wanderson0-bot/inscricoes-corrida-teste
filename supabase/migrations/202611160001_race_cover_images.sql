alter table public.races
  add column cover_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'race-covers',
  'race-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Organizers upload covers for their races"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'race-covers'
  and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  and array_length(storage.foldername(name), 1) = 2
  and name = (select public.current_organization_id())::text || '/' || (storage.foldername(name))[2] || '/cover'
  and exists (
    select 1 from public.races r
    where r.id::text = (storage.foldername(name))[2]
      and r.organization_id = (select public.current_organization_id())
  )
);

create policy "Organizers update covers for their races"
on storage.objects for update to authenticated
using (
  bucket_id = 'race-covers'
  and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  and array_length(storage.foldername(name), 1) = 2
  and name = (select public.current_organization_id())::text || '/' || (storage.foldername(name))[2] || '/cover'
  and exists (
    select 1 from public.races r
    where r.id::text = (storage.foldername(name))[2]
      and r.organization_id = (select public.current_organization_id())
  )
)
with check (
  bucket_id = 'race-covers'
  and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  and array_length(storage.foldername(name), 1) = 2
  and name = (select public.current_organization_id())::text || '/' || (storage.foldername(name))[2] || '/cover'
  and exists (
    select 1 from public.races r
    where r.id::text = (storage.foldername(name))[2]
      and r.organization_id = (select public.current_organization_id())
  )
);
