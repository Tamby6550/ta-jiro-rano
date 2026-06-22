-- ============================================================
--  0010_shared_meters.sql — Sous-compteurs partagés (électricité)
--  Deux maisons (ou +) peuvent partager UN sous-compteur. On relève l'index
--  du compteur, et sa consommation est divisée à PARTS ÉGALES entre les
--  maisons. Le reste du moteur (pertes, montant) suit naturellement.
--
--  Source de vérité : table d'association meter_houses (meter_id ↔ house_id).
--  - compteur individuel  → 1 ligne
--  - compteur partagé      → N lignes (meters.house_id = NULL)
-- ============================================================

-- 1) Autoriser un sous-compteur sans house_id (cas partagé)
alter table public.meters drop constraint if exists meter_house_coherence;
alter table public.meters add constraint meter_house_coherence
  check (kind = 'sub' or house_id is null);  -- le principal n'a jamais de maison

-- 2) Table d'association
create table if not exists public.meter_houses (
  meter_id    uuid not null references public.meters (id) on delete cascade,
  house_id    uuid not null references public.houses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  primary key (meter_id, house_id)
);
create index if not exists meter_houses_house_idx on public.meter_houses (house_id);

-- 3) Auto-link : un sous-compteur individuel (house_id renseigné) crée sa ligne
create or replace function public.meter_house_autolink()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'sub' and new.house_id is not null then
    insert into public.meter_houses (meter_id, house_id, property_id)
    values (new.id, new.house_id, new.property_id) on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists meters_autolink on public.meters;
create trigger meters_autolink after insert on public.meters
  for each row execute function public.meter_house_autolink();

-- 4) Backfill des sous-compteurs existants
insert into public.meter_houses (meter_id, house_id, property_id)
select m.id, m.house_id, m.property_id from public.meters m
where m.kind = 'sub' and m.house_id is not null
on conflict do nothing;

-- 5) RLS + grants
alter table public.meter_houses enable row level security;
create policy meter_houses_select on public.meter_houses
  for select to authenticated using (is_property_member(property_id));
create policy meter_houses_insert on public.meter_houses
  for insert to authenticated with check (is_property_admin(property_id));
create policy meter_houses_delete on public.meter_houses
  for delete to authenticated using (is_property_admin(property_id));
grant select, insert, update, delete on public.meter_houses to authenticated;

-- 6) Regrouper des maisons sur UN compteur partagé (≥ 2 maisons)
create or replace function public.set_shared_meter(p_house_ids uuid[], p_serial text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_prop uuid; v_meter uuid;
begin
  if coalesce(array_length(p_house_ids, 1), 0) < 2 then
    raise exception 'Sélectionner au moins 2 maisons.';
  end if;
  if (select count(distinct property_id) from public.houses where id = any(p_house_ids)) <> 1 then
    raise exception 'Les maisons doivent appartenir à la même propriété.';
  end if;
  select property_id into v_prop from public.houses where id = any(p_house_ids) limit 1;
  if not public.is_property_admin(v_prop) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  -- Détacher ces maisons de leurs compteurs élec actuels
  delete from public.meter_houses mh using public.meters m
  where mh.meter_id = m.id and m.utility = 'electricity' and m.kind = 'sub'
    and mh.house_id = any(p_house_ids);

  -- Supprimer les compteurs élec devenus vides
  delete from public.meters m
  where m.property_id = v_prop and m.utility = 'electricity' and m.kind = 'sub'
    and not exists (select 1 from public.meter_houses mh where mh.meter_id = m.id);

  -- Créer le compteur partagé (sans house_id) et y relier les maisons
  insert into public.meters (property_id, kind, utility, house_id, serial)
  values (v_prop, 'sub', 'electricity', null,
          coalesce(nullif(trim(p_serial), ''), 'SC-PARTAGE-' || substr(gen_random_uuid()::text, 1, 4)))
  returning id into v_meter;

  insert into public.meter_houses (meter_id, house_id, property_id)
  select v_meter, hid, v_prop from unnest(p_house_ids) hid;

  return v_meter;
end; $$;
grant execute on function public.set_shared_meter(uuid[], text) to authenticated;

-- 7) Séparer un compteur partagé → un compteur individuel par maison
create or replace function public.split_shared_meter(p_meter_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_prop uuid; v_rec record; v_new uuid; i int := 0;
begin
  select property_id into v_prop from public.meters where id = p_meter_id;
  if v_prop is null then raise exception 'Compteur introuvable.'; end if;
  if not public.is_property_admin(v_prop) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  for v_rec in
    select mh.house_id, h.name from public.meter_houses mh
    join public.houses h on h.id = mh.house_id
    where mh.meter_id = p_meter_id
  loop
    i := i + 1;
    insert into public.meters (property_id, kind, utility, house_id, serial)
    values (v_prop, 'sub', 'electricity', v_rec.house_id,
            'SC-' || upper(substr(v_rec.name, length(v_rec.name), 1)) || '-EL-' || i)
    returning id into v_new;  -- le trigger crée la ligne meter_houses
  end loop;

  delete from public.meters where id = p_meter_id;  -- cascade meter_houses
end; $$;
grant execute on function public.split_shared_meter(uuid) to authenticated;

-- 8) Moteur de calcul : la conso d'un sous-compteur est divisée à parts égales
--    entre les maisons qui le partagent. Seul le bloc d'insertion élec change.
create or replace function public.compute_invoice_allocations(p_invoice_id uuid)
returns table (
  id uuid, invoice_id uuid, house_id uuid,
  consumption numeric, adjusted_consumption numeric, percentage numeric,
  loss_share numeric, amount numeric, strategy public.allocation_strategy,
  manual_override numeric,
  house_name text, tenant_name text, house_color text, occupants_count int
)
language plpgsql security invoker set search_path = public
as $$
#variable_conflict use_column
declare
  v_inv public.invoices; v_strategy public.allocation_strategy;
  v_principal numeric; v_sum_sub numeric; v_loss numeric; v_sum_occ numeric;
  v_weight_sum numeric; v_override_sum numeric; v_distributable numeric;
  v_total numeric; v_rounded_sum numeric; v_diff numeric; v_target uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Facture introuvable (%).', p_invoice_id using errcode='no_data_found'; end if;
  if not public.is_property_admin(v_inv.property_id) then
    raise exception 'Acces refuse.' using errcode='42501'; end if;

  v_strategy := case v_inv.utility when 'electricity' then 'proportional_loss' else 'occupants' end;
  v_total := round(v_inv.total_amount);

  drop table if exists _calc;
  create temp table _calc (
    house_id uuid primary key, consumption numeric default 0, occupants int default 0,
    percentage numeric default 0, loss_share numeric default 0, adjusted numeric default 0,
    override numeric, raw_amount numeric default 0, amount numeric default 0);

  insert into _calc (house_id, override)
  select a.house_id, a.manual_override from public.allocations a
  where a.invoice_id = p_invoice_id and a.manual_override is not null;

  if v_inv.utility = 'electricity' then
    select r.consumption into v_principal
    from public.meter_readings r join public.meters m on m.id = r.meter_id
    where m.property_id = v_inv.property_id and m.utility='electricity'
      and m.kind='main' and r.period_id = v_inv.period_id;
    if v_principal is null then
      raise exception 'Releve du compteur principal manquant.' using errcode='no_data_found'; end if;

    -- Conso par maison = conso du compteur / nombre de maisons qui le partagent
    insert into _calc (house_id, consumption, occupants)
    select mh.house_id,
           coalesce(r.consumption, 0) / cnt.n,
           h.occupants_count
    from public.meters m
    join public.meter_houses mh on mh.meter_id = m.id
    join public.houses h on h.id = mh.house_id
    join (select meter_id, count(*) n from public.meter_houses group by meter_id) cnt on cnt.meter_id = m.id
    left join public.meter_readings r on r.meter_id = m.id and r.period_id = v_inv.period_id
    where m.property_id = v_inv.property_id and m.utility='electricity' and m.kind='sub'
    on conflict (house_id) do update
      set consumption = excluded.consumption, occupants = excluded.occupants;

    select coalesce(sum(consumption),0) into v_sum_sub from _calc;
    v_loss := v_principal - v_sum_sub;
    update _calc set
      percentage = case when v_sum_sub>0 then consumption/v_sum_sub else 0 end,
      loss_share = case when v_sum_sub>0 then v_loss*(consumption/v_sum_sub) else 0 end
    where true;
    update _calc set adjusted = consumption + loss_share where true;
    update _calc set raw_amount = case when v_principal>0 then v_total*(adjusted/v_principal) else 0 end where true;
  else
    insert into _calc (house_id, occupants)
    select id, occupants_count from public.houses where property_id = v_inv.property_id
    on conflict (house_id) do update set occupants = excluded.occupants;
    select coalesce(sum(occupants),0) into v_sum_occ from _calc;
    update _calc set
      percentage = case when v_sum_occ>0 then occupants::numeric/v_sum_occ else 0 end,
      consumption = 0, adjusted = 0, loss_share = 0 where true;
    update _calc set raw_amount = case when v_sum_occ>0 then v_total*(occupants::numeric/v_sum_occ) else 0 end where true;
  end if;

  select coalesce(sum(override),0) into v_override_sum from _calc where override is not null;
  v_distributable := v_total - v_override_sum;
  select coalesce(sum(raw_amount),0) into v_weight_sum from _calc where override is null;
  update _calc set raw_amount = override where override is not null;
  if v_weight_sum > 0 then
    update _calc set raw_amount = v_distributable*(raw_amount/v_weight_sum) where override is null;
  end if;

  update _calc set amount = round(raw_amount) where true;
  select coalesce(sum(amount),0) into v_rounded_sum from _calc;
  v_diff := v_total - v_rounded_sum;
  if v_diff <> 0 then
    select c.house_id into v_target from _calc c where c.override is null order by c.raw_amount desc nulls last limit 1;
    if v_target is null then select c.house_id into v_target from _calc c order by c.raw_amount desc limit 1; end if;
    update _calc set amount = amount + v_diff where house_id = v_target;
  end if;

  delete from public.allocations where invoice_id = p_invoice_id;
  insert into public.allocations (property_id, invoice_id, house_id, consumption, adjusted_consumption,
    percentage, loss_share, amount, strategy, manual_override)
  select v_inv.property_id, p_invoice_id, c.house_id, c.consumption, c.adjusted,
         c.percentage, c.loss_share, c.amount, v_strategy, c.override from _calc c;
  drop table _calc;

  return query
  select a.id, a.invoice_id, a.house_id, a.consumption, a.adjusted_consumption,
         a.percentage, a.loss_share, a.amount, a.strategy, a.manual_override,
         h.name, h.tenant_name, h.color, h.occupants_count
  from public.allocations a join public.houses h on h.id = a.house_id
  where a.invoice_id = p_invoice_id order by h.position;
end; $$;
