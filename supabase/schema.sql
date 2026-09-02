-- My Diet — Supabase schema
--
-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query)
-- after creating the project. Mirrors the Dexie tables (see src/db/dexie.ts) as a
-- durable backup — not the primary store, Dexie is. RLS scopes every row to the
-- signed-in owner via auth.uid(), matching the single-owner magic-link auth in
-- src/db/sync.ts.
--
-- After running this, copy the project's URL and anon key (Project Settings > API)
-- into .env.local as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Sync activates
-- automatically once those are set — nothing else in the app needs to change.

create table if not exists log_entries (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  timestamp timestamptz not null,
  meal_context text,
  raw_input jsonb not null,
  parsed_items jsonb not null,
  totals jsonb not null,
  status text not null,
  updated_at timestamptz not null
);
alter table log_entries enable row level security;
create policy "own log entries" on log_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists known_products (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  per100g jsonb not null,
  source text not null,
  updated_at timestamptz not null
);
alter table known_products enable row level security;
create policy "own known products" on known_products for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists profile (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  age int not null,
  sex text not null,
  height_cm numeric not null,
  weight_kg numeric not null,
  activity_days_per_week int not null,
  goal text not null,
  targets jsonb not null,
  updated_at timestamptz not null
);
alter table profile enable row level security;
create policy "own profile" on profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
