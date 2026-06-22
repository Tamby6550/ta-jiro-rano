-- ============================================================
--  0012_public_visits.sql — Statistiques de consultation du lien public
--  Déduplication par APPAREIL : un identifiant aléatoire est stocké dans le
--  navigateur du locataire (localStorage) et envoyé à chaque ouverture.
--  Même appareil → 1 visiteur (visit_count s'incrémente) ; autre appareil → +1.
--  L'IP est capturée côté serveur (info complémentaire), jamais fiable seule.
-- ============================================================

create table if not exists public.public_visits (
  property_id uuid not null references public.properties (id) on delete cascade,
  visitor_id  text not null,                 -- identifiant d'appareil (localStorage)
  ip          text,
  visit_count int  not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (property_id, visitor_id)
);
create index if not exists public_visits_prop_idx on public.public_visits (property_id);

alter table public.public_visits enable row level security;
-- L'admin lit les visites de SA propriété. anon ne lit rien (log via fonction).
create policy public_visits_admin_select on public.public_visits
  for select to authenticated using (is_property_admin(property_id));
grant select on public.public_visits to authenticated;

-- Enregistrer une ouverture (appelable par anon). Dédup par (propriété, appareil).
create or replace function public.log_public_visit(p_token uuid, p_visitor text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_prop uuid; v_ip text; v_headers json;
begin
  -- jeton valide + non expiré uniquement
  select id into v_prop from public.properties
  where share_token = p_token and (share_expires_at is null or share_expires_at > now());
  if v_prop is null or coalesce(trim(p_visitor), '') = '' then return; end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := coalesce(
      split_part(v_headers ->> 'cf-connecting-ip', ',', 1),
      split_part(v_headers ->> 'x-forwarded-for', ',', 1),
      v_headers ->> 'x-real-ip');
  exception when others then v_ip := null;
  end;

  insert into public.public_visits (property_id, visitor_id, ip, visit_count, first_seen, last_seen)
  values (v_prop, p_visitor, v_ip, 1, now(), now())
  on conflict (property_id, visitor_id) do update
    set visit_count = public.public_visits.visit_count + 1,
        last_seen = now(),
        ip = coalesce(excluded.ip, public.public_visits.ip);
end; $$;
grant execute on function public.log_public_visit(uuid, text) to anon;
grant execute on function public.log_public_visit(uuid, text) to authenticated;

-- Stats pour l'admin de la propriété courante.
create or replace function public.get_visit_stats()
returns table (visitor_id text, ip text, visit_count int, first_seen timestamptz, last_seen timestamptz)
language sql stable security invoker set search_path = public
as $$
  select pv.visitor_id, pv.ip, pv.visit_count, pv.first_seen, pv.last_seen
  from public.public_visits pv
  where pv.property_id = (select property_id from public.profiles where id = auth.uid())
  order by pv.last_seen desc;
$$;
grant execute on function public.get_visit_stats() to authenticated;
