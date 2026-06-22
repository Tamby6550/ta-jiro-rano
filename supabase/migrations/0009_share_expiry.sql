-- ============================================================
--  0009_share_expiry.sql — Expiration + régénération du lien public
--  • share_expires_at : null = jamais ; sinon le lien expire à cette date.
--  • rotate_share_link(jours) : génère un NOUVEAU jeton (l'ancien lien meurt)
--    et fixe l'expiration. Admin uniquement (RLS sur properties).
--  • public_get : renvoie {expired:true} si le jeton est bon mais périmé.
-- ============================================================

alter table public.properties add column if not exists share_expires_at timestamptz;

-- Régénère le lien de la propriété de l'utilisateur courant.
-- p_days : null/0 = sans expiration ; sinon expire dans p_days jours.
create or replace function public.rotate_share_link(p_days int)
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_exp timestamptz;
  v_id uuid;
begin
  v_exp := case when p_days is null or p_days <= 0
                then null else now() + make_interval(days => p_days) end;

  update public.properties
  set share_token = v_token, share_expires_at = v_exp
  where id = (select property_id from public.profiles where id = auth.uid())
  returning id into v_id;

  if v_id is null then
    raise exception 'Aucune propriete a regenerer.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('share_token', v_token, 'share_expires_at', v_exp);
end;
$$;

grant execute on function public.rotate_share_link(int) to authenticated;

-- public_get : gère l'expiration (jeton valide mais périmé → {expired:true})
create or replace function public.public_get(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case
    when pr.id is null then null
    when pr.share_expires_at is not null and pr.share_expires_at < now()
      then jsonb_build_object('expired', true)
    else jsonb_build_object(
      'property', jsonb_build_object('name', pr.name, 'currency', pr.currency),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', bp.label, 'month_start', bp.start_date, 'utility', i.utility,
          'due_date', i.due_date, 'house_id', h.id, 'house', h.name,
          'tenant', h.tenant_name, 'color', h.color, 'occupants', h.occupants_count,
          'amount', a.amount, 'consumption', a.consumption, 'percentage', a.percentage)
          order by bp.start_date desc, h.position)
        from public.allocations a
        join public.invoices i        on i.id = a.invoice_id
        join public.billing_periods bp on bp.id = i.period_id
        join public.houses h          on h.id = a.house_id
        where a.property_id = pr.id
      ), '[]'::jsonb))
  end
  from public.properties pr
  where pr.share_token = p_token;
$$;
