-- Run this in your Supabase SQL editor to set up Storage buckets.
-- After running, go to Storage in your Supabase dashboard to confirm buckets exist.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers',    'covers',    true,  5242880,  array['image/jpeg','image/png','image/webp','image/gif']),
  ('contracts', 'contracts', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- Covers: public read, owners can upload/delete
create policy "Public can read covers"
  on storage.objects for select using (bucket_id = 'covers');

create policy "Owners can upload covers"
  on storage.objects for insert with check (
    bucket_id = 'covers' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Owners can delete covers"
  on storage.objects for delete using (
    bucket_id = 'covers' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- Contracts: private, only owners can read/write
create policy "Owners can read contracts"
  on storage.objects for select using (
    bucket_id = 'contracts' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Owners can upload contracts"
  on storage.objects for insert with check (
    bucket_id = 'contracts' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

create policy "Owners can delete contracts"
  on storage.objects for delete using (
    bucket_id = 'contracts' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );
