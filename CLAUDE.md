@AGENTS.md

# Zenith

A daily stock screener for **DECA Stock Market Game** competitors (high-school
students). It surfaces the day's biggest US market gainers — framed as "today's
top short candidates" — ranked, with consecutive-day streaks and Pro-gated
Claude AI short theses. The audience is new to markets, so charts default to a
simple area view (not candlesticks). Status: **near-final, pre-launch polish**
— live on Railway; no longer an MVP. Remaining before launch: custom-domain
cutover, a regulatory/branding compliance pass, and engine calibration tweaks.

## Stack

- **Next.js 16** App Router + **React 19** + TypeScript
- **Tailwind v4** + **base-ui** primitives (`components/ui/`), dark glassmorphism
- **Supabase** — Postgres + Auth + RLS (`lib/supabase/{client,server,admin}.ts`)
- **TanStack Query v5** (10-min stale/refetch) for reads; **Zustand**
  (`stores/filtersStore.ts`) for filter UI state
- **next-themes** (light / dark / system)
- **Stripe** subscriptions — Zenith Pro, $4.99/mo
- **In-house quant engine** (`lib/quant/`) for the AI short theses — SEC EDGAR
  catalyst detection + base-rate/rule scoring + TradingView technicals +
  templated prose, $0/day, zero Anthropic calls. The **Anthropic SDK** remains
  only for the optional Haiku prose mode (`AI_PROSE_MODE=haiku`, still behind
  the `AI_THESES_ENABLED` spend switch).
- Market data behind a provider interface (`lib/marketdata/`): **TradingView**
  scanner (sole provider; interface kept as a seam for future sources)

> Non-obvious stack notes (besides the Next.js caveat in AGENTS.md): Tailwind v4
> has **no `tailwind.config.js`** — design tokens are CSS-first in
> `app/globals.css` (`@theme inline`, `:root`, `.dark`). The `components/ui/*`
> primitives are **base-ui (`@base-ui/react`), not Radix** — different API
> (`render` prop for polymorphism, `Positioner`/`Popup` parts); check
> `node_modules/@base-ui/react/<part>` before assuming props. When token/CSS
> changes don't appear in dev, it's browser cache on a stable Turbopack chunk
> URL — hard-refresh (Empty Cache and Hard Reload).

## Data flow

Read and write paths are deliberately separated (an earlier bug had the browser
triggering per-render provider calls).

**Read** — `GET /api/gainers` (DB-first):
1. Serve cached `daily_gainers` for today.
2. During the regular session (9:30–16:00 ET), if data is stale (>10 min),
   self-fetch the provider and cache it.
3. ~30 min before the close (the **pre-close "drop"**), generate AI short theses
   for the top-5 off the intraday data and email opted-in **Pro** users (free
   tiers get no email for now — `lib/notify.ts` filters recipients) — via Next's
   `after()`, `runPreCloseProcessing` in `lib/eod.ts`. This is the actionable
   moment (see Competition mechanics below). Theses store a `rank` so the AI card
   shows exactly the drop's set.
4. ~5 min after the 16:00 close, the first read **finalizes** the official close
   (`is_final`) and runs end-of-day processing (streaks; theses only as a
   **fallback** if the drop failed) in the background — `lib/eod.ts`.
5. Off-hours / weekends / holidays: serve the last finalized day.

**Write / scheduled** — two idempotent backstops, both reusing the read-path
logic, secured by `CRON_SECRET`:
- **Pre-close drop** `GET /api/cron/pre-close` (~3:30 ET): refresh intraday
  gainers, generate theses, email opted-in Pro users (`runPreCloseProcessing`).
- **EOD finalize** `GET /api/cron/run-eod` (~4:05 ET): finalize the official close
  + streaks (theses fallback).

On **Railway** (the deploy target) these fire via an in-process `node-cron`
scheduler — `instrumentation.ts`, ET timezone, an every-5-min check so it adapts
to half-days — so **run a SINGLE replica** (jobs are idempotent regardless).
`vercel.json` keeps the run-eod cron as a Vercel-deployment fallback.

**Competition mechanics (DECA SMG).** It's the *End-of-Day* game: a trade entered
any time during market hours fills at **that day's close**; entered after close →
the **next** day's close. Orders are pending + cancelable until the close — there's
no earlier cutoff. So AI theses must land **before** the close to be actionable
(hence the ~3:30 drop), and only the **regular session** matters. ET
sessions/holidays/half-days live in `lib/market-calendar.ts`. Halted stocks that
report identical values day-over-day are dropped by `dropFrozenRepeats`
(`lib/gainers.ts`).

## Layout

- `app/` — `page.tsx` (home / today), `history/`, `upgrade/`, `settings/`,
  `auth/{login,signup}/`
  - `app/api/` — `gainers/`, `gainers/[date]/`, `streaks/`, `ai-analysis/`
    (Pro-gated), `cron/{run-eod,pre-close}/`, `unsubscribe/`,
    `stripe/{create-checkout,create-portal,webhook}/`
  - `instrumentation.ts` (repo root) — in-process `node-cron` scheduler (Railway)
- `components/` — `gainers/` (hero, table, row, StockChart, badges), `ai/`,
  `history/`, `settings/`, `auth/`, `layout/` (Header, UserMenu, Logo,
  GradientMesh), `ui/` (base-ui)
- `lib/` — `marketdata/` (provider interface + tradingview), `supabase/`,
  `quant/` (thesis engine: `edgar.ts` catalyst detection, `score.ts`
  deterministic scoring, `technicals.ts` TradingView indicators, `thesis.ts`
  prose seam + spend switch), `gainers.ts`, `streaks.ts`, `eod.ts`,
  `claude.ts` (thesis orchestrator), `notify.ts` (pre-close email),
  `market-calendar.ts`, `format.ts`, `alerts.ts`, `baseRates.ts`
- `hooks/` — `useGainers`, `useStreaks`, `useSubscription`, `useMounted`
- `supabase/` — `schema.sql` (fresh install), `migrate.sql` (idempotent, for an
  existing DB)

## Data model (Supabase)

- `profiles` — `id`, `email`, `subscription_tier` (`free` | `pro`),
  `stripe_customer_id`. RLS: own row only.
- `daily_gainers` — one row per `(date, ticker)`: price, change_percent, volume,
  relative_volume, market_cap, sector, rank, `is_final`, scraped_at. RLS: public read.
- `ticker_streaks` — `ticker`, `streak_count`, `last_seen_date`. RLS: public
  read (the app-level gate lives in `/api/streaks`, which requires a session).
- `ai_analyses` — `(date, ticker)`: short_thesis, risk_level, key_catalysts,
  recommendation, model. **RLS: Pro only.**

## Conventions & gotchas

- **Service-role client (`lib/supabase/admin.ts`) must NEVER be imported in a
  `"use client"` component** — server components / API routes only. `.env.local`
  is never committed.
- **Auth/session middleware lives in `proxy.ts` (repo root), not
  `middleware.ts`** — Next.js 16 renamed the `middleware` convention to `proxy`
  (export `proxy()`, not `middleware()`). It refreshes the Supabase session
  cookie on every matched request and auth-gates `/history` (redirects to
  `/auth/login?next=…`).
- AI theses and `GET /api/ai-analysis` are **Pro-gated** (tier check + RLS).
- **Charts and streak badges require an account** — `ChartDialog` renders a
  sign-up gate for signed-out visitors (the TradingView widget is client-side;
  there's no chart API to gate server-side), and `GET /api/streaks` returns an
  empty list without a session (200, not 401 — `useStreaks` would retry-spam a
  401). The Pro `/analysis` chart embeds are already behind auth.
- **TradingView is the sole market-data source** — an undocumented endpoint with
  ToS risk. There's no provider fallback; revisit the licensing/source question
  before any commercial scale. The `MarketDataProvider` interface stays as the
  seam if another source is added.
- **Branding:** cyan→teal + polar-white on near-black (logo
  `components/layout/Logo.tsx`, favicon `app/icon.png`). Tokens
  `--brand`/`--brand-2`/`--up`/`--down` in `app/globals.css` (light `:root` +
  `.dark`). Decorative accents/glows/CTAs use **brand cyan/white**; **green only
  for semantic meaning** (gains, "market live", low-risk) — never decorative.

## Environment (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (read automatically by the SDK; only used in Haiku prose mode)
- `AI_THESES_ENABLED` — **kill switch for all Anthropic calls / spend**
  (`lib/quant/thesis.ts aiThesesEnabled()`, re-exported from `lib/claude.ts`).
  Since the quant engine took over generation this gates ONLY the optional
  Haiku prose mode; absent/anything else = OFF (fail-safe: a fresh env can
  never spend). The quant pipeline itself is free and runs regardless — theses
  generate and the pre-close email sends with the switch off.
- `AI_PROSE_MODE` — thesis prose source: unset/`template` (default, $0,
  deterministic) or `haiku` (one plain Anthropic call per ticker, no web
  search; also requires `AI_THESES_ENABLED=true`). Falls back to the template
  on any failure.
- `SEC_EDGAR_USER_AGENT` — contact string SEC requires on EDGAR requests
  (`lib/quant/edgar.ts`), e.g. `"Zenith Screener you@example.com"`.
- `FINNHUB_API_KEY` — free-tier Finnhub key for the headline catalyst fallback
  (`lib/quant/news.ts`; runs only when EDGAR finds no filing). Absent = news
  step silently skipped. Free-tier dependency — revisit at commercial scale.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET` (Vercel cron sends `Authorization: Bearer $CRON_SECRET`)
- `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` (optional — scraper
  failure alerts via `lib/alerts.ts`; if unset, alerts log to console only, no
  email. Dedup + audit log live in the `system_alerts` table.)
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL`

## Commands

- `npm run dev` — dev server (run **one** only; a second instance causes a
  port-conflict mess)
- `npm run build` / `npm run start` / `npm run lint`
- DB setup: run `supabase/schema.sql` (new) or `supabase/migrate.sql` (existing)
  in the Supabase SQL editor.
- Trigger pre-close drop / EOD locally:
  `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/pre-close`
  `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/run-eod`
