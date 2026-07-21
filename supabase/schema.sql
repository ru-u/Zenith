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
  notify_preclose   boolean not null default true,            -- pre-close email opt-out
  unsubscribe_token uuid not null default gen_random_uuid(),  -- unguessable unsubscribe link
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists profiles_unsubscribe_token_uidx on public.profiles (unsubscribe_token);

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
  id                   bigint generated always as identity primary key,
  date                 date not null,
  ticker               text not null,
  short_thesis         text not null,
  catalyst             text,  -- why it spiked today (from web search)
  catalyst_url         text,  -- source link the model found
  catalyst_type        text,  -- buyout|earnings|offering|regulatory|partnership|meme_squeeze|other
  short_score          smallint check (short_score is null or short_score between 1 and 10),
  percent_win_estimate smallint check (percent_win_estimate is null or percent_win_estimate between 0 and 100),
  invalidation         text,  -- deprecated: no longer written or shown (kept for reversibility)
  key_catalysts        text[] not null default '{}',  -- deprecated: no longer written or shown
  recommendation       text,  -- deprecated: no longer written or shown (kept for reversibility)
  risk_level           text,  -- deprecated: no longer written or shown (kept for reversibility)
  model                text,
  rank                 integer,  -- denormalized from daily_gainers at the ~3:30 drop
  company_name         text,     -- so the AI card renders the exact drop set, in order
  -- Realized next-session outcome, recorded by the following day's EOD run —
  -- the calibration data the scoring Δs get re-fit against (lib/quant/outcomes.ts).
  next_date            date,              -- the session the outcome was measured on
  next_close           double precision,  -- that session's close
  next_change_percent  double precision,  -- close-to-close % vs the scored day
  outcome_win          boolean,           -- true = closed lower (the short "won")
  -- Candidate-signal snapshot captured at scoring time (lib/quant/features.ts):
  -- price-path/levels, serial-runner history, FINRA short ratio, pinned-tape.
  -- Captured but NOT scored until the September re-fit proves a signal out.
  features             jsonb,
  -- Payoff dimension: win% × median down-move + loss% × median up-move for the
  -- ticker's base-rate bucket, in percent (the game grades magnitude, not hits).
  expected_move_percent double precision,
  created_at           timestamptz not null default now(),
  unique (date, ticker)
);

create index if not exists ai_analyses_date_idx on public.ai_analyses (date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- historical_gainers — ~1yr of prototype top-gainer scrapes WITH next-day price,
-- the label for base-rate calibration (Phase 2). Internal: RLS on, NO policy
-- (deny-all to anon/auth; the service-role client bypasses RLS).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.historical_gainers (
  id              bigint generated always as identity primary key,
  spike_date      date not null,
  ticker          text not null,
  spike_close     numeric,
  day_range_pct   numeric,
  next_date       date,
  next_close      numeric,
  next_day_return numeric,   -- (next_close - spike_close) / spike_close
  next_day_down   boolean,   -- next_day_return < 0  (a winning next-day short)
  market_cap      numeric,
  relative_volume numeric,   -- relvol from the scrape (relvol_30d)
  sector          text,
  industry        text,
  created_at      timestamptz not null default now(),
  unique (spike_date, ticker)
);
create index if not exists historical_gainers_bucket_idx
  on public.historical_gainers (market_cap, relative_volume);

-- gainer_base_rates — precomputed "closed lower next day" rates by feature bucket.
-- cap_band/relvol_band = 'ALL' for the coarser fallbacks (cap-only, then global).
create table if not exists public.gainer_base_rates (
  cap_band               text not null,  -- nano | micro | small | mid | ALL
  relvol_band            text not null,  -- rv_lt5 | rv_5_20 | rv_20_100 | rv_100plus | ALL
  n                      integer not null,
  down_rate              numeric not null,  -- P(next_day_down), 0..1
  median_next_day_return numeric,
  median_down_move       numeric,  -- typical move when it closed lower (fraction, < 0)
  median_up_move         numeric,  -- typical move when it closed higher (fraction, > 0)
  updated_at             timestamptz not null default now(),
  primary key (cap_band, relvol_band)
);

alter table public.historical_gainers enable row level security;
alter table public.gainer_base_rates  enable row level security;

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
-- system_alerts — critical-failure log + dedup for scraper alerting.
-- The unique (date, alert_type) is the dedup key: one email per condition/day.
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
-- Written only by /api/favorites (service role); the select-own policy below
-- lets the authed client read its own rows (defense-in-depth). PK (user_id,
-- ticker) doubles as the per-user lookup index.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.favorites (
  user_id    uuid not null references auth.users (id) on delete cascade,
  ticker     text not null
             constraint favorites_ticker_format_check check (ticker ~ '^[A-Z][A-Z0-9.\-]{0,9}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

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
alter table public.system_alerts  enable row level security;
alter table public.feedback       enable row level security;
alter table public.favorites      enable row level security;

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

-- favorites: a user can read only their own rows; writes go through the API
-- (service role) — no insert/delete policy, consistent with every other table.
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

-- fetch_locks, system_alerts & feedback: no anon/auth access (service-role
-- only). RLS enabled with no policies = deny all for non-service roles.
