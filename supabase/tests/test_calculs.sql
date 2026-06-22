-- ============================================================
--  test_calculs.sql — Tests du moteur de répartition
--  Lancer : psql "$SUPABASE_DB_URL" -f supabase/tests/test_calculs.sql
--  (après `supabase db reset`). Tout est en transaction + ROLLBACK :
--  le test ne laisse aucune trace.
--
--  Astuce : on simule un utilisateur authentifié en posant le claim JWT
--  `sub`. auth.uid() le lit ; seed/compute (SECURITY INVOKER) tournent alors
--  comme si cet utilisateur appelait l'API. owner_id = ce sub → admin OK.
-- ============================================================

begin;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

select public.seed_demo_property() as property_id \gset

-- --- Affichage de contrôle : répartition élec Juin ---
\echo '--- Répartition ÉLEC Juin 2026 ---'
select h.name, a.consumption, a.loss_share, a.adjusted_consumption,
       round(a.percentage*100) as pct, a.amount
from public.allocations a
join public.invoices i on i.id = a.invoice_id
join public.houses h on h.id = a.house_id
where i.number = 'JRM-2026-06-ELEC'
order by h.position;

do $$
declare
  v_elec numeric; v_eau numeric; v_a numeric; v_main numeric; v_cnt int;
begin
  -- 1) Σ(montants élec Juin) = total facturé (462 000)
  select sum(a.amount), count(*) into v_elec, v_cnt
  from public.allocations a join public.invoices i on i.id=a.invoice_id
  where i.number='JRM-2026-06-ELEC';
  assert v_elec = 462000, format('ÉLEC Juin: Σ=%s attendu 462000', v_elec);
  assert v_cnt = 4, format('ÉLEC Juin: %s lignes attendu 4', v_cnt);

  -- 2) Maison A = 138 536 Ar (valeur maquette)
  select a.amount into v_a
  from public.allocations a join public.invoices i on i.id=a.invoice_id
  join public.houses h on h.id=a.house_id
  where i.number='JRM-2026-06-ELEC' and h.name='Maison A';
  assert v_a = 138536, format('Maison A élec=%s attendu 138536', v_a);

  -- 3) Σ(montants eau Juin) = 96 000
  select sum(a.amount) into v_eau
  from public.allocations a join public.invoices i on i.id=a.invoice_id
  where i.number='JRM-2026-06-EAU';
  assert v_eau = 96000, format('EAU Juin: Σ=%s attendu 96000', v_eau);

  -- 4) Cohérence des index seedés : principal Juin new = 45982 (= maquette)
  select r.new_index into v_main
  from public.meter_readings r
  join public.meters m on m.id=r.meter_id
  join public.billing_periods p on p.id=r.period_id
  where m.kind='main' and m.utility='electricity' and p.label='Juin 2026';
  assert v_main = 45982, format('Index principal Juin=%s attendu 45982', v_main);

  -- 5) Tous les mois facturés : Σ montants = total facture
  perform 1;
  if exists (
    select 1 from (
      select i.id, i.total_amount, sum(a.amount) s
      from public.invoices i join public.allocations a on a.invoice_id=i.id
      group by i.id, i.total_amount
    ) t where t.s <> t.total_amount
  ) then
    raise exception 'Au moins une facture a Σ(montants) <> total !';
  end if;

  raise notice '✅ Tous les tests de répartition PASSENT.';
end;
$$;

rollback;
