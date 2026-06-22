-- ============================================================
--  0008_setup_property.sql — Onboarding propriétaire (compte = propriétaire)
--  Remplace le seed de démo : un nouvel utilisateur crée SA propriété VIDE
--  (nom libre), devient admin, et obtient les compteurs principaux + le mois
--  courant prêts à la saisie. Idempotent.
-- ============================================================

create or replace function public.setup_my_property(p_name text)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_prop uuid; v_label text; v_start date; v_end date;
  fr text[] := array['Janvier','Fevrier','Mars','Avril','Mai','Juin',
                     'Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
begin
  select id into v_prop from public.properties where owner_id = auth.uid() limit 1;
  if v_prop is not null then return v_prop; end if;

  insert into public.properties (owner_id, name, currency)
  values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'Ma propriete'), 'MGA')
  returning id into v_prop;

  update public.profiles set property_id = v_prop, role = 'admin', house_id = null
  where id = auth.uid();

  insert into public.meters (property_id, kind, utility, house_id, serial) values
    (v_prop, 'main', 'electricity', null, 'JRM-MAIN-EL'),
    (v_prop, 'main', 'water',       null, 'JRM-MAIN-EA');

  v_label := fr[extract(month from current_date)::int] || ' ' || extract(year from current_date)::text;
  v_end   := current_date;
  v_start := (current_date - interval '30 day')::date;
  insert into public.billing_periods (property_id, utility, label, start_date, end_date) values
    (v_prop, 'electricity', v_label, v_start, v_end),
    (v_prop, 'water',       v_label, v_start, v_end);

  return v_prop;
end;
$$;
