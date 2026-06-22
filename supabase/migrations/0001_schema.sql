-- ============================================================
--  0001_schema.sql — Schéma de base TA·JIRO·RANO
--  Tout est rattaché à property_id dès le départ (multi-propriétaires).
--  Dates RÉELLES (start_date/end_date), jamais de mois calendaire figé.
-- ============================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------- Types énumérés ----------
create type public.user_role          as enum ('admin', 'tenant');
create type public.utility_kind       as enum ('electricity', 'water');
create type public.meter_kind         as enum ('main', 'sub');
create type public.invoice_status     as enum ('draft', 'pending', 'paid');
create type public.allocation_strategy as enum ('proportional_loss', 'occupants');

-- ---------- properties : le « tenant » SaaS (un propriétaire / un client) ----------
create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  currency    text not null default 'MGA',
  created_at  timestamptz not null default now()
);

-- ---------- profiles : lié 1-1 à auth.users ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null default 'tenant',
  full_name    text,
  property_id  uuid references public.properties (id) on delete set null,
  house_id     uuid,  -- fk ajoutée après création de houses (cf. plus bas)
  created_at   timestamptz not null default now()
);

-- ---------- buildings : évolutif (plusieurs bâtiments par propriété) ----------
create table public.buildings (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  name         text not null
);

-- ---------- houses : une maison = un foyer = un sous-compteur ----------
create table public.houses (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  building_id     uuid references public.buildings (id) on delete set null,
  name            text not null,                 -- ex: "Maison A"
  label           text,                          -- ex: "RDC gauche"
  tenant_name     text,                          -- ex: "Rina R."
  color           text default '#6b7689',        -- accent UI
  occupants_count int  not null default 1 check (occupants_count >= 0),  -- répartition eau
  position        int  not null default 0,
  created_at      timestamptz not null default now()
);

-- fk profiles.house_id (différée car houses créée après profiles)
alter table public.profiles
  add constraint profiles_house_fk foreign key (house_id) references public.houses (id) on delete set null;

-- ---------- meters : 1 principal + N sous-compteurs, par énergie ----------
create table public.meters (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  kind         public.meter_kind not null,
  utility      public.utility_kind not null,
  house_id     uuid references public.houses (id) on delete cascade,  -- null si principal
  serial       text,
  -- Cohérence : un compteur principal n'a pas de maison, un sous-compteur en a une.
  constraint meter_house_coherence check (
    (kind = 'main' and house_id is null) or (kind = 'sub' and house_id is not null)
  )
);
-- Un seul compteur principal par (propriété, énergie)
create unique index meters_one_main_per_prop_utility
  on public.meters (property_id, utility) where (kind = 'main');
-- Un seul sous-compteur par (maison, énergie)
create unique index meters_one_sub_per_house
  on public.meters (house_id, utility) where (kind = 'sub');

-- ---------- billing_periods : dates RÉELLES, non calendaires ----------
create table public.billing_periods (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  utility      public.utility_kind not null,
  label        text not null,            -- ex: "Juin 2026"
  start_date   date not null,
  end_date     date not null,
  created_at   timestamptz not null default now(),
  constraint period_dates_order check (end_date >= start_date)
);
create index billing_periods_prop_idx on public.billing_periods (property_id, start_date desc);

-- ---------- invoices : facture JIRAMA principale ----------
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  period_id     uuid not null references public.billing_periods (id) on delete cascade,
  utility       public.utility_kind not null,
  number        text not null,           -- ex: "JRM-2026-06-ELEC"
  total_amount  numeric(14,2) not null check (total_amount >= 0),
  billing_date  date not null,
  due_date      date not null,
  status        public.invoice_status not null default 'pending',
  photo_path    text,                    -- chemin Supabase Storage
  created_at    timestamptz not null default now(),
  unique (property_id, number)
);
create index invoices_prop_idx on public.invoices (property_id, billing_date desc);

-- ---------- meter_readings : relevés d'index ----------
create table public.meter_readings (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  meter_id     uuid not null references public.meters (id) on delete cascade,
  period_id    uuid not null references public.billing_periods (id) on delete cascade,
  old_index    numeric(14,2) not null,
  new_index    numeric(14,2) not null,
  -- consommation = colonne GÉNÉRÉE (cohérence garantie par Postgres)
  consumption  numeric(14,2) generated always as (new_index - old_index) stored,
  photo_path   text,
  ocr_raw      text,   -- réservé OCR futur (nullable)
  created_at   timestamptz not null default now(),
  constraint reading_index_order check (new_index >= old_index),
  unique (meter_id, period_id)
);
create index meter_readings_period_idx on public.meter_readings (period_id);

-- ---------- allocations : résultat de la répartition (par maison & facture) ----------
create table public.allocations (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  invoice_id            uuid not null references public.invoices (id) on delete cascade,
  house_id              uuid not null references public.houses (id) on delete cascade,
  consumption           numeric(14,2) not null default 0,
  adjusted_consumption  numeric(14,2) not null default 0,
  percentage            numeric(8,6)  not null default 0,
  loss_share            numeric(14,2) not null default 0,
  amount                numeric(14,2) not null default 0,  -- Ariary entier, Σ = total
  strategy              public.allocation_strategy not null,
  manual_override       numeric(14,2),                     -- ajustement manuel traçable
  computed_at           timestamptz not null default now(),
  unique (invoice_id, house_id)
);
create index allocations_invoice_idx on public.allocations (invoice_id);

-- ============================================================
--  Trigger : créer un profil à chaque inscription auth.users
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'tenant');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
