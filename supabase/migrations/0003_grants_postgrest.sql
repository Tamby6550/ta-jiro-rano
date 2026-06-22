-- ============================================================
--  0003_grants_postgrest.sql
--  ⚠️ Changement PostgREST 2026 : pour les projets Supabase créés
--  après le 30 mai 2026, les tables ne sont PAS exposées par l'API REST
--  sans GRANTs Postgres explicites — même avec la RLS bien écrite.
--  On accorde donc les privilèges au rôle `authenticated`.
--  La RLS (0002) reste la barrière de sécurité réelle ; les grants ne
--  font qu'« ouvrir la porte » de l'API, ligne par ligne filtrée par RLS.
--  Le rôle `anon` ne reçoit RIEN (app 100% authentifiée).
-- ============================================================

grant usage on schema public to authenticated;

-- CRUD complet au rôle authenticated (filtré par RLS table par table).
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Séquences (au cas où des colonnes serial seraient ajoutées plus tard).
grant usage, select on all sequences in schema public to authenticated;

-- Exécution des fonctions RPC de calcul.
grant execute on all functions in schema public to authenticated;

-- Valeurs par défaut pour les objets FUTURS créés par le rôle propriétaire
-- (migrations ultérieures) : évite d'oublier un grant.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
