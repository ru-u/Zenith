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
-- Pre-close email opt-out + a per-user token so the unsubscribe link can't be
-- forged to unsubscribe other users.
alter table public.profiles add column if not exists notify_preclose boolean not null default true;
alter table public.profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsubscribe_token_uidx on public.profiles (unsubscribe_token);

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
alter table public.daily_gainers add column if not exists exchange text;
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
-- 1-day-horizon thesis fields (catalyst via web search + ranked/teaching outputs).
alter table public.ai_analyses add column if not exists catalyst text;
alter table public.ai_analyses add column if not exists catalyst_url text;
alter table public.ai_analyses add column if not exists catalyst_type text;
alter table public.ai_analyses add column if not exists short_score smallint;
alter table public.ai_analyses add column if not exists percent_win_estimate smallint;
alter table public.ai_analyses add column if not exists invalidation text;
-- Denormalized from daily_gainers at generation time so the AI card renders the
-- exact set of theses produced at the ~3:30 drop, in order, even if the live
-- gainer list shifts before the close.
alter table public.ai_analyses add column if not exists rank integer;
alter table public.ai_analyses add column if not exists company_name text;
alter table public.ai_analyses add column if not exists exchange text;
-- Realized next-session outcome (calibration data; lib/quant/outcomes.ts)
alter table public.ai_analyses add column if not exists next_date date;
alter table public.ai_analyses add column if not exists next_close double precision;
alter table public.ai_analyses add column if not exists next_change_percent double precision;
alter table public.ai_analyses add column if not exists outcome_win boolean;
-- Candidate-signal snapshot + payoff dimension (lib/quant/features.ts)
alter table public.ai_analyses add column if not exists features jsonb;
alter table public.ai_analyses add column if not exists expected_move_percent double precision;
alter table public.ai_analyses add column if not exists created_at timestamptz not null default now();

create unique index if not exists ai_analyses_date_ticker_uidx on public.ai_analyses (date, ticker);
create index if not exists ai_analyses_date_idx on public.ai_analyses (date desc);

-- risk_level is deprecated (every runner here is risky, so the label doesn't
-- differentiate) — its job moves to percent_win_estimate + catalyst-aware analysis.
-- Stop requiring/validating it; keep the column nullable & unused for reversibility.
alter table public.ai_analyses alter column risk_level drop not null;
alter table public.ai_analyses drop constraint if exists ai_analyses_risk_level_check;

-- invalidation, key_catalysts, recommendation are deprecated (the card now shows
-- only metadata → why it spiked → thesis → score/win%). Keep the columns nullable
-- & unused for reversibility; recommendation must drop NOT NULL so inserts omit it.
alter table public.ai_analyses alter column recommendation drop not null;

-- Range guards for the new ranked outputs.
alter table public.ai_analyses drop constraint if exists ai_analyses_short_score_check;
alter table public.ai_analyses
  add constraint ai_analyses_short_score_check check (short_score is null or short_score between 1 and 10);
alter table public.ai_analyses drop constraint if exists ai_analyses_pct_win_check;
alter table public.ai_analyses
  add constraint ai_analyses_pct_win_check check (percent_win_estimate is null or percent_win_estimate between 0 and 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: historical_gainers (~1yr scrapes + next-day price) + gainer_base_rates
-- (precomputed "closed lower next day" rates by feature bucket). Internal tables —
-- RLS on with no policy (deny-all to anon/auth; service-role bypasses).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.historical_gainers (
  id bigint generated always as identity primary key
);
alter table public.historical_gainers add column if not exists spike_date date;
alter table public.historical_gainers add column if not exists ticker text;
alter table public.historical_gainers add column if not exists spike_close numeric;
alter table public.historical_gainers add column if not exists day_range_pct numeric;
alter table public.historical_gainers add column if not exists next_date date;
alter table public.historical_gainers add column if not exists next_close numeric;
alter table public.historical_gainers add column if not exists next_day_return numeric;
alter table public.historical_gainers add column if not exists next_day_down boolean;
alter table public.historical_gainers add column if not exists market_cap numeric;
alter table public.historical_gainers add column if not exists relative_volume numeric;
alter table public.historical_gainers add column if not exists sector text;
alter table public.historical_gainers add column if not exists industry text;
alter table public.historical_gainers add column if not exists created_at timestamptz not null default now();
create unique index if not exists historical_gainers_date_ticker_uidx on public.historical_gainers (spike_date, ticker);
create index if not exists historical_gainers_bucket_idx on public.historical_gainers (market_cap, relative_volume);

create table if not exists public.gainer_base_rates (
  cap_band               text not null,
  relvol_band            text not null,
  n                      integer not null,
  down_rate              numeric not null,
  median_next_day_return numeric,
  updated_at             timestamptz not null default now(),
  primary key (cap_band, relvol_band)
);
-- Conditional medians for the expected-move dimension (fractions, like
-- median_next_day_return): typical move when the next day closed lower / higher.
alter table public.gainer_base_rates add column if not exists median_down_move numeric;
alter table public.gainer_base_rates add column if not exists median_up_move numeric;

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
-- system_alerts — critical-failure log + dedup for scraper alerting
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.system_alerts (
  id         bigint generated always as identity primary key,
  date       text not null,
  alert_type text not null,
  detail     text,
  created_at timestamptz not null default now(),
  unique (date, alert_type)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- feedback — bug reports & feature suggestions from Settings → Support.
-- Written only by the API route (service role); users never read it back.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  email      text,
  type       text not null check (type in ('bug', 'feature')),
  message    text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- favorites — per-user starred tickers, pinned to the top of the screener.
-- Written only by /api/favorites (service role); select-own RLS below.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.favorites (
  user_id    uuid not null references auth.users (id) on delete cascade,
  ticker     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ticker)
);
alter table public.favorites drop constraint if exists favorites_ticker_format_check;
alter table public.favorites
  add constraint favorites_ticker_format_check check (ticker ~ '^[A-Z][A-Z0-9.\-]{0,9}$');

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
alter table public.system_alerts  enable row level security;
alter table public.historical_gainers enable row level security;
alter table public.gainer_base_rates  enable row level security;
alter table public.feedback       enable row level security;
alter table public.favorites      enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

-- SECURITY FIX (2026-08-26): drop profiles_update_own, do NOT recreate it.
-- RLS gates rows, not columns, so "update your own row" let any signed-in user
-- self-grant `subscription_tier = 'pro'` from the browser with the public anon
-- key, or plant another user's `stripe_customer_id` on their own row and open
-- that person's Stripe Billing Portal via /api/stripe/create-portal. Nothing in
-- the app ever updated profiles client-side — every write is service-role — so
-- removing the policy costs no functionality. See schema.sql for the long form.
drop policy if exists "profiles_update_own" on public.profiles;

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

-- favorites: read-own; writes go through the API (service role), no write policy.
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table grants — second lock on every write (see schema.sql for the rationale).
-- Supabase's default privileges give anon/authenticated full DML on public
-- tables; Zenith has no client-side writes, so revoke them. Fails closed even
-- if an over-broad policy is added later.
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke insert, update, delete on tables from anon, authenticated;

revoke all on function public.claim_fetch(text, integer) from public, anon, authenticated;

-- Force PostgREST to pick up the new columns immediately.
notify pgrst, 'reload schema';
