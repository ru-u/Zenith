-- Zenith schema — run in the Supabase SQL editor.
-- Authored fresh (no verbatim DDL existed in the repo).
-- snake_case throughout. Writes happen via the service-role client (bypasses RLS);
-- RLS below governs what the anon/auth client may read.

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles — extends auth.users
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  stripe_customer_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_gainers — one row per ticker per trading day
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_gainers (
  id              bigint generated always as identity primary key,
  date            date not null,
  ticker          text not null,
  company_name    text,
  price           numeric,
  change_percent  numeric,
  volume          bigint,
  relative_volume numeric,
  market_cap      numeric,
  sector          text,
  rank            integer,
  is_final        boolean not null default false,
  scraped_at      timestamptz not null default now(),
  unique (date, ticker)
);

create index if not exists daily_gainers_date_idx on public.daily_gainers (date desc);
create index if not exists daily_gainers_date_rank_idx on public.daily_gainers (date desc, rank asc);

-- ─────────────────────────────────────────────────────────────────────────────
-- ticker_streaks — consecutive trading days a ticker appeared (O(1) per cron run)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticker_streaks (
  ticker         text primary key,
  streak_count   integer not null default 1,
  last_seen_date date not null,
  updated_at     timestamptz not null default now()
);

create index if not exists ticker_streaks_count_idx on public.ticker_streaks (streak_count desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- ai_analyses — Pro-gated Claude short theses
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_analyses (
  id             bigint generated always as identity primary key,
  date           date not null,
  ticker         text not null,
  short_thesis   text not null,
  risk_level     text not null check (risk_level in ('low', 'medium', 'high', 'extreme')),
  key_catalysts  text[] not null default '{}',
  recommendation text not null,
  model          text,
  created_at     timestamptz not null default now(),
  unique (date, ticker)
);

create index if not exists ai_analyses_date_idx on public.ai_analyses (date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- fetch_locks — atomic claim for on-demand provider fetches (thundering-herd guard)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fetch_locks (
  key       text primary key,
  locked_at timestamptz not null default now()
);

-- Atomically claim a fetch slot. Returns true only to the caller that wins.
-- A lock is reclaimable once older than p_ttl_seconds (covers crashed fetchers).
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
-- Auto-create a profile row when a new auth user signs up
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.daily_gainers  enable row level security;
alter table public.ticker_streaks enable row level security;
alter table public.ai_analyses    enable row level security;
alter table public.fetch_locks    enable row level security;

-- profiles: a user can read/update only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- daily_gainers & ticker_streaks: public read
drop policy if exists "daily_gainers_public_read" on public.daily_gainers;
create policy "daily_gainers_public_read" on public.daily_gainers
  for select using (true);

drop policy if exists "ticker_streaks_public_read" on public.ticker_streaks;
create policy "ticker_streaks_public_read" on public.ticker_streaks
  for select using (true);

-- ai_analyses: Pro subscribers only (defense-in-depth alongside the API route check)
drop policy if exists "ai_analyses_pro_read" on public.ai_analyses;
create policy "ai_analyses_pro_read" on public.ai_analyses
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.subscription_tier = 'pro'
    )
  );

-- fetch_locks: no anon/auth access (only the service role / SECURITY DEFINER fn touch it).
-- RLS enabled with no policies = deny all for non-service roles.
