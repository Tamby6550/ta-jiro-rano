-- ============================================================
--  0004_rpc_calculs.sql — Moteur de répartition (cœur métier)
--
--  Deux RPC :
--   • compute_invoice_allocations(invoice)  : calcule + PERSISTE (admin only)
--   • get_invoice_allocations(invoice)      : lit le résultat (membres)
--
--  Règles :
--   • Électricité : redistribution proportionnelle des PERTES réseau.
--   • Eau         : prorata du nombre d'occupants.
--   • Montants Ariary ENTIERS ; le reste d'arrondi est absorbé par UNE maison
--     pour garantir Σ(montants) = montant_total EXACTEMENT.
--   • Stratégie « pluggable » via invoice.utility ; override manuel honoré
--     et traçable (colonne allocations.manual_override).
-- ============================================================

create or replace function public.compute_invoice_allocations(p_invoice_id uuid)
returns table (
  id uuid, invoice_id uuid, house_id uuid,
  consumption numeric, adjusted_consumption numeric, percentage numeric,
  loss_share numeric, amount numeric, strategy public.allocation_strategy,
  manual_override numeric,
  house_name text, tenant_name text, house_color text, occupants_count int
)
language plpgsql
security invoker            -- s'exécute avec les droits de l'appelant → RLS s'applique
set search_path = public
as $$
-- Les noms de colonnes de sortie (id, consumption, amount…) entrent en conflit
-- avec les colonnes des tables/temp interrogées. Cette directive dit à PL/pgSQL
-- de résoudre toute ambiguïté en faveur de la COLONNE (jamais la variable OUT).
#variable_conflict use_column
declare
  v_inv        public.invoices;
  v_strategy   public.allocation_strategy;
  v_principal  numeric;     -- consommation compteur principal (élec)
  v_sum_sub    numeric;     -- somme des sous-compteurs (élec)
  v_loss       numeric;     -- pertes réseau (élec)
  v_sum_occ    numeric;     -- somme des occupants (eau)
  v_weight_sum numeric;     -- somme des poids des maisons non-override
  v_override_sum numeric;   -- somme des overrides
  v_distributable numeric;  -- total - overrides, à répartir
  v_total      numeric;
  v_rounded_sum numeric;
  v_diff       numeric;
  v_target     uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Facture introuvable (%).', p_invoice_id using errcode = 'no_data_found';
  end if;
  if not public.is_property_admin(v_inv.property_id) then
    raise exception 'Accès refusé : seul un admin de la propriété peut calculer.' using errcode = '42501';
  end if;

  v_strategy := case v_inv.utility when 'electricity' then 'proportional_loss'
                                   else 'occupants' end;
  v_total := round(v_inv.total_amount);

  -- Table de travail. `drop if exists` + drop explicite en fin de fonction :
  -- permet d'appeler la RPC plusieurs fois dans UNE même transaction (ex: seed)
  -- sans collision de nom (ce que ferait `on commit drop`).
  drop table if exists _calc;
  create temp table _calc (
    house_id uuid primary key,
    consumption numeric default 0,
    occupants int default 0,
    percentage numeric default 0,
    loss_share numeric default 0,
    adjusted numeric default 0,
    override numeric,           -- manual_override repris de l'existant
    raw_amount numeric default 0,
    amount numeric default 0
  );

  -- Reprend les overrides éventuels d'un calcul précédent (traçabilité)
  insert into _calc (house_id, override)
  select a.house_id, a.manual_override
  from public.allocations a
  where a.invoice_id = p_invoice_id and a.manual_override is not null;

  if v_inv.utility = 'electricity' then
    -- Index principal de la période (élec)
    select r.consumption into v_principal
    from public.meter_readings r
    join public.meters m on m.id = r.meter_id
    where m.property_id = v_inv.property_id and m.utility = 'electricity'
      and m.kind = 'main' and r.period_id = v_inv.period_id;

    if v_principal is null then
      raise exception 'Relevé du compteur principal manquant pour cette période.'
        using errcode = 'no_data_found';
    end if;

    -- Consommations des sous-compteurs
    insert into _calc (house_id, consumption, occupants)
    select m.house_id, coalesce(r.consumption, 0), h.occupants_count
    from public.meters m
    join public.houses h on h.id = m.house_id
    left join public.meter_readings r on r.meter_id = m.id and r.period_id = v_inv.period_id
    where m.property_id = v_inv.property_id and m.utility = 'electricity' and m.kind = 'sub'
    on conflict (house_id) do update
      set consumption = excluded.consumption, occupants = excluded.occupants;

    select coalesce(sum(consumption), 0) into v_sum_sub from _calc;
    v_loss := v_principal - v_sum_sub;

    -- percentage / loss_share / adjusted (perte redistribuée proportionnellement)
    -- `where true` requis : Supabase active safe-update (UPDATE sans WHERE
    -- interdit) pour le rôle authenticated. Ces updates portent sur tout _calc.
    update _calc set
      percentage = case when v_sum_sub > 0 then consumption / v_sum_sub else 0 end,
      loss_share = case when v_sum_sub > 0 then v_loss * (consumption / v_sum_sub) else 0 end
    where true;
    update _calc set adjusted = consumption + loss_share where true;
    -- montant brut = total × (adjusted / principal) = total × percentage
    update _calc set raw_amount =
      case when v_principal > 0 then v_total * (adjusted / v_principal) else 0 end
    where true;

  else
    -- EAU : prorata occupants
    insert into _calc (house_id, occupants)
    select id, occupants_count from public.houses where property_id = v_inv.property_id
    on conflict (house_id) do update set occupants = excluded.occupants;

    select coalesce(sum(occupants), 0) into v_sum_occ from _calc;
    update _calc set
      percentage = case when v_sum_occ > 0 then occupants::numeric / v_sum_occ else 0 end,
      consumption = 0, adjusted = 0, loss_share = 0
    where true;
    update _calc set raw_amount =
      case when v_sum_occ > 0 then v_total * (occupants::numeric / v_sum_occ) else 0 end
    where true;
  end if;

  -- ---- Overrides : on fige les montants forcés, on redistribue le reste ----
  select coalesce(sum(override), 0) into v_override_sum from _calc where override is not null;
  v_distributable := v_total - v_override_sum;
  select coalesce(sum(raw_amount), 0) into v_weight_sum from _calc where override is null;

  update _calc set raw_amount = override where override is not null;
  if v_weight_sum > 0 then
    update _calc set raw_amount = v_distributable * (raw_amount / v_weight_sum)
    where override is null;
  end if;

  -- ---- Arrondi entier Ariary + report du reste sur UNE maison ----
  update _calc set amount = round(raw_amount) where true;
  select coalesce(sum(amount), 0) into v_rounded_sum from _calc;
  v_diff := v_total - v_rounded_sum;            -- reste d'arrondi (souvent -2..+2)

  if v_diff <> 0 then
    -- maison cible = plus gros montant non-override (sinon plus gros montant)
    select c.house_id into v_target from _calc c
    where c.override is null order by c.raw_amount desc nulls last limit 1;
    if v_target is null then
      select c.house_id into v_target from _calc c order by c.raw_amount desc limit 1;
    end if;
    update _calc set amount = amount + v_diff where house_id = v_target;
  end if;

  -- ---- Persistance idempotente ----
  delete from public.allocations where invoice_id = p_invoice_id;
  insert into public.allocations (
    property_id, invoice_id, house_id, consumption, adjusted_consumption,
    percentage, loss_share, amount, strategy, manual_override
  )
  select v_inv.property_id, p_invoice_id, c.house_id, c.consumption, c.adjusted,
         c.percentage, c.loss_share, c.amount, v_strategy, c.override
  from _calc c;

  drop table _calc;

  -- ---- Retour enrichi (jointure maison) ----
  return query
  select a.id, a.invoice_id, a.house_id, a.consumption, a.adjusted_consumption,
         a.percentage, a.loss_share, a.amount, a.strategy, a.manual_override,
         h.name, h.tenant_name, h.color, h.occupants_count
  from public.allocations a
  join public.houses h on h.id = a.house_id
  where a.invoice_id = p_invoice_id
  order by h.position;
end;
$$;

-- Lecture seule (locataires) : renvoie la dernière répartition persistée.
create or replace function public.get_invoice_allocations(p_invoice_id uuid)
returns table (
  id uuid, invoice_id uuid, house_id uuid,
  consumption numeric, adjusted_consumption numeric, percentage numeric,
  loss_share numeric, amount numeric, strategy public.allocation_strategy,
  manual_override numeric,
  house_name text, tenant_name text, house_color text, occupants_count int
)
language sql stable security invoker set search_path = public
as $$
  select a.id, a.invoice_id, a.house_id, a.consumption, a.adjusted_consumption,
         a.percentage, a.loss_share, a.amount, a.strategy, a.manual_override,
         h.name, h.tenant_name, h.color, h.occupants_count
  from public.allocations a
  join public.houses h on h.id = a.house_id
  where a.invoice_id = p_invoice_id
  order by h.position;
$$;
