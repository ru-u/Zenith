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
  -- Mirrored from auth.users by the triggers below. PostgREST cannot join
  -- across into the auth schema, so without this copy there is no way to filter
  -- unconfirmed addresses out of an email recipient query, or to count real
  -- users. Null = signed up but never confirmed (and pruned after 24h).
  email_confirmed_at timestamptz,
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
  exchange        text,  -- listing venue (NASDAQ | NYSE); qualifies the ticker for external lookups
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
  exchange             text,     -- denormalized venue so chart embeds can qualify the symbol
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
-- Auto-create a profile row when a new auth user signs up.
--
-- The row is created at SIGNUP, before the address is confirmed — email
-- confirmation is on, so `auth.users` gets its row immediately and this fires
-- then. That means profiles can hold accounts that will never be able to sign
-- in, which is why `email_confirmed_at` is mirrored here (so recipient queries
-- and user counts can tell the difference without reaching across schemas into
-- auth, which PostgREST cannot do) and why unconfirmed rows are pruned hourly.
--
-- The mirrored value is copied on INSERT because OAuth users arrive already
-- confirmed, and updated by the trigger below when a password signup confirms.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, email_confirmed_at)
  values (new.id, new.email, new.email_confirmed_at)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mirror the confirmation timestamp through when the user clicks the link.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email_confirmed_at = new.email_confirmed_at
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function public.handle_user_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- Accounts that never confirm are deleted after 24h (lib/pruneUnconfirmed.ts).
--
-- Measured from `confirmation_sent_at`, NOT `created_at`: a flat 24h-from-signup
-- rule would hand someone who resends at hour 23 a fresh link and then delete
-- the account an hour later. Coalescing means every resend buys a full window.
--
-- A row with email_confirmed_at null cannot sign in, so deleting it is lossless
-- (assumes no phone auth, where that would not hold). Returning ids only — the
-- caller resolves them through the admin API.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_prunable_unconfirmed(p_hours integer default 24)
returns table (id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where u.email_confirmed_at is null
    and coalesce(u.confirmation_sent_at, u.created_at) < now() - make_interval(hours => p_hours)
$$;

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

-- profiles: a user can READ only their own row. There is deliberately NO update
-- policy.
--
-- There used to be a `profiles_update_own` policy (`for update using
-- (auth.uid() = id)`). Postgres RLS gates rows, not columns, so "update your
-- own row" meant "update ANY column of your own row" — and the anon key ships
-- to every browser. Any signed-in user could open devtools and run
--
--   supabase.from('profiles').update({ subscription_tier: 'pro' }).eq('id', me)
--
-- to grant themselves Zenith Pro (the ai_analyses RLS policy trusts this exact
-- column), or write someone else's `stripe_customer_id` into their own row and
-- then hit /api/stripe/create-portal to open the Stripe Billing Portal against
-- that stranger's customer — their invoices, card, and cancel button.
--
-- No client code ever updated this table: every legitimate write is server-side
-- through the service role (the Stripe webhook sets the tier, checkout stores
-- the customer id, /api/unsubscribe flips notify_preclose). So the policy
-- granted nothing the product used and everything an attacker wanted. Any
-- future user-editable field needs an API route that whitelists the columns.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Table grants — the second lock on every write.
--
-- RLS is not the only thing standing between the public anon key and this data;
-- the underlying GRANTs are. Supabase's default privileges hand `anon` and
-- `authenticated` full DML on new public tables, which means a single
-- over-broad policy (or a policy added in a hurry from the SQL editor) is all
-- that separates a browser from an UPDATE. Zenith has no client-side writes at
-- all — every mutation goes through an API route on the service role — so the
-- write grants are revoked outright. A missing GRANT fails closed even if a
-- permissive policy shows up later.
--
-- Read grants are left intact: the select policies above are doing real work
-- (public gainers/streaks, own-profile, own-favorites, Pro-only analyses).
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- And for tables added later, so this doesn't silently decay.
alter default privileges in schema public
  revoke insert, update, delete on tables from anon, authenticated;

-- Security-definer functions — keep them callable only by the server.
-- list_prunable_unconfirmed reads auth.users; exposing it would leak which
-- accounts exist and are unconfirmed.
revoke all on function public.claim_fetch(text, integer) from public, anon, authenticated;
revoke all on function public.list_prunable_unconfirmed(integer) from public, anon, authenticated;
