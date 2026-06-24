@AGENTS.md

# Zenith

A daily stock screener for **DECA Stock Market Game** competitors (high-school
students). It surfaces the day's biggest US market gainers — framed as "today's
top short candidates" — ranked, with consecutive-day streaks and Pro-gated
Claude AI short theses. The audience is new to markets, so charts default to a
simple area view (not candlesticks). Status: **pre-launch MVP**.

## Stack

- **Next.js 16** App Router + **React 19** + TypeScript
- **Tailwind v4** + **base-ui** primitives (`components/ui/`), dark glassmorphism
- **Supabase** — Postgres + Auth + RLS (`lib/supabase/{client,server,admin}.ts`)
- **TanStack Query v5** (10-min stale/refetch) for reads; **Zustand**
  (`stores/filtersStore.ts`) for filter UI state
- **next-themes** (light / dark / system)
- **Stripe** subscriptions — Zenith Pro, $4.99/mo
- **Anthropic SDK** (`claude-sonnet-4-6`) for AI theses
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
3. ~5 min after the 16:00 close, the first read **finalizes** the official close
   (`is_final`) and, via Next's `after()`, runs end-of-day processing (streaks +
   AI) in the background — see `lib/eod.ts`.
4. Off-hours / weekends / holidays: serve the last finalized day.

**Write** — `GET /api/cron/run-eod` (Vercel cron `5 21 * * 1-5` ≈ 16:05 ET in
winter / 17:05 ET in summer): a backstop that finalizes + runs `runEodProcessing`.
Idempotent with the read-path finalize.

Only the **regular session** matters — DECA orders execute at the close. ET
sessions/holidays live in `lib/market-calendar.ts`. Halted stocks that report
identical values day-over-day are dropped by `dropFrozenRepeats` (`lib/gainers.ts`).

## Layout

- `app/` — `page.tsx` (home / today), `history/`, `upgrade/`, `settings/`,
  `auth/{login,signup}/`
  - `app/api/` — `gainers/`, `gainers/[date]/`, `streaks/`, `ai-analysis/`
    (Pro-gated), `cron/run-eod/`, `stripe/{create-checkout,create-portal,webhook}/`
- `components/` — `gainers/` (hero, table, row, StockChart, badges), `ai/`,
  `history/`, `settings/`, `auth/`, `layout/` (Header, UserMenu, Logo,
  GradientMesh), `ui/` (base-ui)
- `lib/` — `marketdata/` (provider interface + tradingview), `supabase/`,
  `gainers.ts`, `streaks.ts`, `eod.ts`, `claude.ts`, `market-calendar.ts`,
  `format.ts`
- `hooks/` — `useGainers`, `useStreaks`, `useSubscription`
- `supabase/` — `schema.sql` (fresh install), `migrate.sql` (idempotent, for an
  existing DB)

## Data model (Supabase)

- `profiles` — `id`, `email`, `subscription_tier` (`free` | `pro`),
  `stripe_customer_id`. RLS: own row only.
- `daily_gainers` — one row per `(date, ticker)`: price, change_percent, volume,
  relative_volume, market_cap, sector, rank, `is_final`, scraped_at. RLS: public read.
- `ticker_streaks` — `ticker`, `streak_count`, `last_seen_date`. RLS: public read.
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
- `ANTHROPIC_API_KEY` (read automatically by the SDK)
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
- Trigger EOD locally:
  `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/run-eod`
