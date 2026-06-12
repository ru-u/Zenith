-- Zenith idempotent migration — brings an existing (older) Supabase schema in
-- line with the rebuild WITHOUT dropping data. Safe to run multiple times.
-- Run in the Supabase SQL editor. Then reload the PostgREST schema cache
-- (it usually reloads automatically; the final NOTIFY forces it).

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists subscription_tier text not null default 'free';
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_subscription_tier_check;
alter table public.profiles
  add constraint profiles_subscription_tier_check check (subscription_tier in ('free', 'pro'));

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_gainers
-- (market_cap left as-is if it already exists as bigint — the app rounds it.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_gainers (
  id bigint generated always as identity primary key
);
alter table public.daily_gainers add column if not exists date date;
alter table public.daily_gainers add column if not exists ticker text;
alter table public.daily_gainers add column if not exists company_name text;
alter table public.daily_gainers add column if not exists price numeric;
alter table public.daily_gainers add column if not exists change_percent numeric;
alter table public.daily_gainers add column if not exists volume bigint;
alter table public.daily_gainers add column if not exists relative_volume numeric;
alter table public.daily_gainers add column if not exists market_cap numeric;
alter table public.daily_gainers add column if not exists sector text;
alter table public.daily_gainers add column if not exists rank integer;
alter table public.daily_gainers add column if not exists is_final boolean not null default false;
alter table public.daily_gainers add column if not exists scraped_at timestamptz not null default now();

create unique index if not exists daily_gainers_date_ticker_uidx on public.daily_gainers (date, ticker);
create index if not exists daily_gainers_date_idx on public.daily_gainers (date desc);
create index if not exists daily_gainers_date_rank_idx on public.daily_gainers (date desc, rank asc);

-- ─────────────────────────────────────────────────────────────────────────────
-- ticker_streaks
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticker_streaks (
  ticker text primary key
);
alter table public.ticker_streaks add column if not exists streak_count integer not null default 1;
alter table public.ticker_streaks add column if not exists last_seen_date date;
alter table public.ticker_streaks add column if not exists updated_at timestamptz not null default now();

create index if not exists ticker_streaks_count_idx on public.ticker_streaks (streak_count desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai_analyses
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_analyses (
  id bigint generated always as identity primary key
);
alter table public.ai_analyses add column if not exists date date;
alter table public.ai_analyses add column if not exists ticker text;
alter table public.ai_analyses add column if not exists short_thesis text;
alter table public.ai_analyses add column if not exists risk_level text;
alter table public.ai_analyses add column if not exists key_catalysts text[] not null default '{}';
alter table public.ai_analyses add column if not exists recommendation text;
alter table public.ai_analyses add column if not exists model text;
alter table public.ai_analyses add column if not exists created_at timestamptz not null default now();

create unique index if not exists ai_analyses_date_ticker_uidx on public.ai_analyses (date, ticker);
create index if not exists ai_analyses_date_idx on public.ai_analyses (date desc);

-- Drop-and-recreate (not guarded) — an older deployment had this constraint
-- WITHOUT 'extreme', which rejects parabolic runners. Existing rows are all
-- valid values, so re-adding the superset constraint is safe.
alter table public.ai_analyses drop constraint if exists ai_analyses_risk_level_check;
alter table public.ai_analyses
  add constraint ai_analyses_risk_level_check check (risk_level in ('low', 'medium', 'high', 'extreme'));

-- ─────────────────────────────────────────────────────────────────────────────
-- fetch_locks + claim_fetch (thundering-herd guard)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fetch_locks (
  key text primary key,
  locked_at timestamptz not null default now()
);

create or replace function public.claim_fetch(p_key text, p_ttl_seconds integer default 30)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  won boolean;
begin
  insert into public.fetch_locks (key, locked_at)
  values (p_key, now())
  on conflict (key) do update
    set locked_at = now()
    where public.fetch_locks.locked_at < now() - make_interval(secs => p_ttl_seconds)
  returning true into won;
  return coalesce(won, false);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- handle_new_user trigger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any pre-existing auth users.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.daily_gainers  enable row level security;
alter table public.ticker_streaks enable row level security;
alter table public.ai_analyses    enable row level security;
alter table public.fetch_locks    enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "daily_gainers_public_read" on public.daily_gainers;
create policy "daily_gainers_public_read" on public.daily_gainers for select using (true);

drop policy if exists "ticker_streaks_public_read" on public.ticker_streaks;
create policy "ticker_streaks_public_read" on public.ticker_streaks for select using (true);

drop policy if exists "ai_analyses_pro_read" on public.ai_analyses;
create policy "ai_analyses_pro_read" on public.ai_analyses for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.subscription_tier = 'pro'
  )
);

-- Force PostgREST to pick up the new columns immediately.
notify pgrst, 'reload schema';
