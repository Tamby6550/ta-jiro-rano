-- ============================================================
--  0006_seed_function.sql — Données de démonstration
--  Fonction appelable APRÈS connexion : crée une propriété appartenant
--  à l'utilisateur courant, avec les 4 foyers et 6 mois de relevés
--  cohérents avec les maquettes (les index de Juin 2026 tombent
--  exactement sur ceux du design : principal 45210→45982, etc.).
--
--  Idempotente : ne fait rien si l'utilisateur possède déjà une propriété.
--  Usage frontend : await supabase.rpc('seed_demo_property')
-- ============================================================

create or replace function public.seed_demo_property()
returns uuid
language plpgsql
security invoker set search_path = public
as $$
declare
  v_prop uuid;
  v_house uuid[];                  -- ids maisons A,B,C,D
  v_emeter uuid[];                 -- sous-compteurs élec A..D
  v_main_e uuid;                   -- compteur principal élec
  -- Données mensuelles (Jan..Jun 2026)
  labels text[] := array['Janvier 2026','Février 2026','Mars 2026','Avril 2026','Mai 2026','Juin 2026'];
  mm     text[] := array['01','02','03','04','05','06'];
  -- consommations élec par maison + pertes (sum + loss = principal)
  ca int[] := array[180,190,205,210,208,215];
  cb int[] := array[220,235,210,240,250,255];
  cc int[] := array[130,138,150,140,142,145];
  cd int[] := array[ 95, 98, 90,100,101,102];
  loss int[] := array[40,45,48,50,52,55];
  -- montants facturés (NULL = pas de facture ce mois-ci)
  e_amt int[] := array[null,null,null,441000,428000,462000];
  w_amt int[] := array[null,null,null, 92000, 91000, 96000];
  -- index de départ (avant Janvier) calculés pour retomber sur Juin maquette
  oi_main int := 41643;
  oi_a int := 11037; oi_b int := 7735; oi_c int := 4860; oi_d int := 2836;
  ni_main int; ni_a int; ni_b int; ni_c int; ni_d int;
  v_period uuid; v_inv uuid; v_tmp uuid;
  i int;
begin
  -- garde d'idempotence
  select id into v_prop from public.properties where owner_id = auth.uid() limit 1;
  if v_prop is not null then return v_prop; end if;

  insert into public.properties (owner_id, name, currency)
  values (auth.uid(), 'Résidence Ankadivato', 'MGA') returning id into v_prop;

  -- l'utilisateur devient admin de SA propriété
  update public.profiles
  set role = 'admin', property_id = v_prop,
      full_name = coalesce(full_name, 'Rina R.')
  where id = auth.uid();

  -- 4 foyers (couleurs = design)
  insert into public.houses (property_id, name, label, tenant_name, color, occupants_count, position)
  values
    (v_prop,'Maison A','RDC gauche','Rina R. (Vous)','#f5a524',3,1),
    (v_prop,'Maison B','RDC droite','Hery & Voahangy','#0fb5ad',4,2),
    (v_prop,'Maison C','Étage','Naina A.','#6366f1',2,3),
    (v_prop,'Studio D','Annexe','Tiana M.','#ec4899',1,4);

  select array_agg(id order by position) into v_house
  from public.houses where property_id = v_prop;

  -- Rattache la maison A au profil de l'utilisateur (il habite Maison A)
  update public.profiles set house_id = v_house[1] where id = auth.uid();

  -- Compteurs : principal élec/eau + sous-compteurs élec/eau par maison
  insert into public.meters (property_id, kind, utility, house_id, serial)
  values (v_prop,'main','electricity',null,'JRM-MAIN-EL') returning id into v_main_e;
  insert into public.meters (property_id, kind, utility, house_id, serial)
  values (v_prop,'main','water',null,'JRM-MAIN-EA');

  for i in 1..4 loop
    -- NB : un élément de tableau (v_emeter[i]) n'est pas une cible INTO valide
    -- en PL/pgSQL → on passe par un scalaire puis on assigne avec ':='.
    insert into public.meters (property_id, kind, utility, house_id, serial)
    values (v_prop,'sub','electricity',v_house[i],'SC-'||chr(64+i)||'-EL')
    returning id into v_tmp;
    v_emeter[i] := v_tmp;
    insert into public.meters (property_id, kind, utility, house_id, serial)
    values (v_prop,'sub','water',v_house[i],'SC-'||chr(64+i)||'-EA');
  end loop;

  -- Boucle mensuelle : périodes + relevés élec + factures (3 derniers mois)
  for i in 1..6 loop
    ni_main := oi_main + ca[i]+cb[i]+cc[i]+cd[i]+loss[i];
    ni_a := oi_a + ca[i]; ni_b := oi_b + cb[i]; ni_c := oi_c + cc[i]; ni_d := oi_d + cd[i];

    -- Période ÉLEC (dates réelles, non calendaires)
    insert into public.billing_periods (property_id, utility, label, start_date, end_date)
    values (v_prop,'electricity',labels[i],
            (make_date(2026,i,16) - interval '1 month')::date, (make_date(2026,i,15) + interval '1 day')::date)
    returning id into v_period;

    insert into public.meter_readings (property_id, meter_id, period_id, old_index, new_index)
    values
      (v_prop, v_main_e,    v_period, oi_main, ni_main),
      (v_prop, v_emeter[1], v_period, oi_a, ni_a),
      (v_prop, v_emeter[2], v_period, oi_b, ni_b),
      (v_prop, v_emeter[3], v_period, oi_c, ni_c),
      (v_prop, v_emeter[4], v_period, oi_d, ni_d);

    if e_amt[i] is not null then
      insert into public.invoices (property_id, period_id, utility, number, total_amount,
                                   billing_date, due_date, status)
      values (v_prop, v_period, 'electricity', 'JRM-2026-'||mm[i]||'-ELEC', e_amt[i],
              make_date(2026,i,16), make_date(2026,i,30),
              (case when i < 6 then 'paid' else 'pending' end)::public.invoice_status)
      returning id into v_inv;
      perform public.compute_invoice_allocations(v_inv);
    end if;

    -- Période EAU + facture (prorata occupants, pas de relevé d'index requis)
    insert into public.billing_periods (property_id, utility, label, start_date, end_date)
    values (v_prop,'water',labels[i],
            (make_date(2026,i,18) - interval '1 month')::date, (make_date(2026,i,17) + interval '1 day')::date)
    returning id into v_period;

    if w_amt[i] is not null then
      insert into public.invoices (property_id, period_id, utility, number, total_amount,
                                   billing_date, due_date, status)
      values (v_prop, v_period, 'water', 'JRM-2026-'||mm[i]||'-EAU', w_amt[i],
              make_date(2026,i,18), (make_date(2026,i,30) + interval '2 day')::date,
              (case when i < 6 then 'paid' else 'pending' end)::public.invoice_status)
      returning id into v_inv;
      perform public.compute_invoice_allocations(v_inv);
    end if;

    oi_main := ni_main; oi_a := ni_a; oi_b := ni_b; oi_c := ni_c; oi_d := ni_d;
  end loop;

  return v_prop;
end;
$$;
