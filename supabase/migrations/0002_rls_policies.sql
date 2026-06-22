-- ============================================================
--  0002_rls_policies.sql — Row Level Security
--  RLS activé sur TOUTES les tables. Aucune table exposée sans politique.
--  Le frontend n'utilise que l'anon key ; toute la sécurité vit ici.
-- ============================================================

-- ---------- Fonctions d'aide (SECURITY DEFINER = ne déclenchent pas la RLS,
--            évitant la récursion infinie quand on interroge profiles) ----------

-- Ensemble des propriétés accessibles à l'utilisateur courant :
-- celles qu'il possède (owner) + celle rattachée à son profil (locataire).
create or replace function public.user_property_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.properties where owner_id = auth.uid()
  union
  select property_id from public.profiles where id = auth.uid() and property_id is not null;
$$;

-- L'utilisateur est-il admin de cette propriété ?
-- (propriétaire de la propriété, OU profil admin rattaché à cette propriété)
create or replace function public.is_property_admin(p uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.properties where id = p and owner_id = auth.uid())
      or exists (select 1 from public.profiles
                 where id = auth.uid() and property_id = p and role = 'admin');
$$;

-- L'utilisateur est-il membre (admin ou locataire) de cette propriété ?
create or replace function public.is_property_member(p uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p in (select public.user_property_ids());
$$;

-- ---------- Activation RLS ----------
alter table public.properties      enable row level security;
alter table public.profiles        enable row level security;
alter table public.buildings       enable row level security;
alter table public.houses          enable row level security;
alter table public.meters          enable row level security;
alter table public.billing_periods enable row level security;
alter table public.invoices        enable row level security;
alter table public.meter_readings  enable row level security;
alter table public.allocations     enable row level security;

-- ---------- properties ----------
create policy properties_select on public.properties
  for select to authenticated using (is_property_member(id));
create policy properties_insert on public.properties
  for insert to authenticated with check (owner_id = auth.uid());
create policy properties_update on public.properties
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy properties_delete on public.properties
  for delete to authenticated using (owner_id = auth.uid());

-- ---------- profiles ----------
-- Chacun lit/modifie son propre profil ; un admin lit les profils de sa propriété.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or (property_id is not null and is_property_admin(property_id)));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- L'admin gère les profils (rôle, rattachement maison) de sa propriété.
create policy profiles_admin_manage on public.profiles
  for update to authenticated
  using (property_id is not null and is_property_admin(property_id))
  with check (property_id is not null and is_property_admin(property_id));

-- ---------- Macro : politiques génériques par property_id ----------
-- Lecture = tout membre (transparence v1). Écriture = admin de la propriété.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'buildings','houses','meters','billing_periods','invoices','meter_readings','allocations'
  ]
  loop
    execute format($f$
      create policy %1$s_select on public.%1$I
        for select to authenticated using (is_property_member(property_id));
      create policy %1$s_insert on public.%1$I
        for insert to authenticated with check (is_property_admin(property_id));
      create policy %1$s_update on public.%1$I
        for update to authenticated
          using (is_property_admin(property_id)) with check (is_property_admin(property_id));
      create policy %1$s_delete on public.%1$I
        for delete to authenticated using (is_property_admin(property_id));
    $f$, tbl);
  end loop;
end;
$$;
