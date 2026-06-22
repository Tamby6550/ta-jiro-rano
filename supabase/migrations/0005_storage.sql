-- ============================================================
--  0005_storage.sql — Buckets Supabase Storage + RLS
--  Convention de chemin : {property_id}/{period_id}/{house_id}-{timestamp}.jpg
--  La RLS Storage filtre sur le 1er segment du chemin (= property_id).
--  Buckets PRIVÉS : l'affichage se fait via URL signées (cf. DataService).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meter-photos',   'meter-photos',   false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('invoice-photos', 'invoice-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Helper : le 1er segment du chemin est-il une propriété accessible ?
-- (storage.foldername(name) renvoie un tableau des segments du chemin)
create or replace function public.storage_property_ok(object_name text)
returns boolean
language sql stable security definer set search_path = public, storage
as $$
  select public.is_property_member((storage.foldername(object_name))[1]::uuid);
$$;

create or replace function public.storage_property_admin(object_name text)
returns boolean
language sql stable security definer set search_path = public, storage
as $$
  select public.is_property_admin((storage.foldername(object_name))[1]::uuid);
$$;

-- Lecture : tout membre de la propriété (transparence v1).
create policy "tjr storage read" on storage.objects
  for select to authenticated
  using (bucket_id in ('meter-photos','invoice-photos') and public.storage_property_ok(name));

-- Écriture / maj / suppression : admin de la propriété uniquement.
create policy "tjr storage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('meter-photos','invoice-photos') and public.storage_property_admin(name));

create policy "tjr storage update" on storage.objects
  for update to authenticated
  using (bucket_id in ('meter-photos','invoice-photos') and public.storage_property_admin(name));

create policy "tjr storage delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('meter-photos','invoice-photos') and public.storage_property_admin(name));
