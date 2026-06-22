-- ============================================================
--  0007_public_share.sql — Accès public locataire (sans login)
--  Modèle : un compte = un propriétaire (admin). Les locataires ne se
--  connectent pas ; ils consultent leurs montants via un LIEN PUBLIC partagé.
--
--  Sécurité : on n'expose AUCUNE table au rôle anon. L'accès passe par une
--  unique fonction SECURITY DEFINER qui ne renvoie que les données de la
--  propriété dont le jeton (share_token) est fourni. Jeton invalide → null.
-- ============================================================

-- Jeton de partage par propriété (régénérable pour révoquer un lien)
alter table public.properties
  add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists properties_share_token_idx on public.properties (share_token);

-- Fonction publique : tout ce qu'il faut pour la page locataire (récap +
-- détail par maison + historique), en un seul appel, au format JSON.
create or replace function public.public_get(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when pr.id is null then null else jsonb_build_object(
    'property', jsonb_build_object('name', pr.name, 'currency', pr.currency),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',       bp.label,
        'month_start', bp.start_date,
        'utility',     i.utility,
        'due_date',    i.due_date,
        'house_id',    h.id,
        'house',       h.name,
        'tenant',      h.tenant_name,
        'color',       h.color,
        'occupants',   h.occupants_count,
        'amount',      a.amount,
        'consumption', a.consumption,
        'percentage',  a.percentage)
        order by bp.start_date desc, h.position)
      from public.allocations a
      join public.invoices i        on i.id = a.invoice_id
      join public.billing_periods bp on bp.id = i.period_id
      join public.houses h          on h.id = a.house_id
      where a.property_id = pr.id
    ), '[]'::jsonb)
  ) end
  from public.properties pr
  where pr.share_token = p_token;
$$;

-- L'anon ne peut RIEN faire d'autre que d'appeler cette fonction.
grant usage on schema public to anon;
grant execute on function public.public_get(uuid) to anon;
grant execute on function public.public_get(uuid) to authenticated;
