# Zenith
# Zenith MVP — Implementation Plan

## Context

Zenith is a clean-slate rebuild of VixSight, a screener that surfaces the top daily
stock-market gainers so DECA stock-market-game students can short the top movers over a
3-month competition. The repo is currently greenfield — only a README spec exists.


---

## Tech Stack (unchanged from v1 except data layer)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) — API routes + cron + SSR in one Vercel deploy |
| Styling | Tailwind CSS + shadcn/ui (bold glassmorphism design system, see below) |
| State | Zustand (filters) + TanStack Query (refetch + cache) |
| DB + Auth | Supabase free tier (Postgres + Auth + RLS) |
| **Market data** | **Swappable provider: TradingView scanner (MVP) → Polygon Starter (prod)** |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5`), cached per ticker/day |
| Hosting | Vercel Hobby (free) |
| Payments | Stripe |

---

## Data Architecture — Swappable Provider (the core change)

A provider interface decouples the rest of the app from any single source. Every provider
returns the **same normalized shape**, so the cron, cache, API routes, and UI never change.

```
lib/marketdata/
├── types.ts          # GainerRow (normalized), MarketStatus, MarketDataProvider interface
├── index.ts          # getProvider() — reads MARKET_DATA_PROVIDER env, returns the impl
├── tradingview.ts    # MVP: POST scanner.tradingview.com/america/scan
├── polygon.ts        # PROD: GET /v2/snapshot/.../tickers (full market) → sort → top 100
└── normalize.ts      # shared helpers (rank, filter price>=3 & mktcap>=25M)
```

**Interface:**
```ts
interface MarketDataProvider {
  getTopGainers(limit: number): Promise<GainerRow[]>;  // ranked, normalized
  getMarketStatus(): Promise<MarketStatus>;            // open/closed/holiday + asOf
}
// GainerRow = { ticker, companyName, price, changePercent, volume,
//               relativeVolume, marketCap, sector, rank }
```

**Coverage strategy (the part Yahoo got wrong):** both providers pull the *full* market and
rank locally so we never miss low-float runners:
- **TradingView (`tradingview.ts`)** — one POST to `scanner.tradingview.com/america/scan`
  with a payload requesting columns (name, close, change%, volume, relative_volume,
  market_cap_basic, sector), sorted by `change` desc, range 0–100. Returns exactly the
  columns the UI needs. Near-real-time.
- **Polygon (`polygon.ts`)** — `GET /v2/snapshot/locale/us/markets/stocks/tickers`
  (10,000+ tickers incl. OTC), filter to common stock, sort by `todaysChangePerc` desc, take
  top 100. (The dedicated `/gainers` endpoint only returns 20 — too few — so we rank the full
  snapshot ourselves.) 15-min delayed, unlimited calls, commercial-licensed.

Selection: `MARKET_DATA_PROVIDER=tradingview | polygon`. Default `tradingview` for MVP.

### Refresh strategy (revised cadence)
Because data is delayed/near-real-time, polling faster than the data updates is wasteful.
**Fetch-on-demand with a shared cache:**
```
User visits → API route checks Supabase latest row for today:
  - scraped_at < ~10 min ago  → return cached rows  (all visitors share one fetch)
  - stale / no data today      → call provider → upsert daily_gainers → return
```
This caps upstream calls at **~30–40/day** regardless of traffic. **One Vercel Cron**
(weekdays 4:05 PM ET, `5 16 * * 1-5`):
1. Call provider → upsert `daily_gainers` with `is_final = true`
2. Update `ticker_streaks` (O(1), see below)
3. For top 6 tickers, generate Claude analyses if missing
4. Trivial daily SELECT to keep Supabase free tier from pausing
Client uses TanStack Query `refetchInterval: 10 * 60 * 1000` hitting our API route (never the
provider directly).

---

## Database Schema (Supabase / Postgres) — carried from v1, all snake_case

Tables: `profiles` (extends `auth.users`, `subscription_tier free|pro`), `daily_gainers`
(one row per ticker/date, `UNIQUE(date,ticker)`, `is_final`, `scraped_at`, indexes on
`date DESC` and `(date DESC, rank ASC)`), `ticker_streaks` (PK `ticker`, `streak_count`,
`last_seen_date` — updated per cron run, O(1) vs VixSight's full-table scan), `ai_analyses`
(Pro-gated, `UNIQUE(date,ticker)`, `risk_level` check, `key_catalysts TEXT[]`).

**RLS:** `ai_analyses` SELECT allowed only when the requesting user's `profiles.subscription_tier = 'pro'`.
(Full DDL is in the repo README; reuse it verbatim, it's correct.)

---

## Design System — Bold Modern Glassmorphism (the v1 fix)

Goal: vibrant, eye-catching, slick — not the flat dark card grid of v1.

- **Palette:** deep near-black base (`#0A0A0F`) with a large animated **radial/conic gradient
  mesh** (violet→fuchsia→cyan) behind frosted panels. Accent = electric violet `#7C5CFF`;
  semantic up/down = emerald/rose.
- **Glass tokens** in `tailwind.config.ts` + globals: `.glass` (backdrop-blur-xl,
  bg-white/5, border-white/10, subtle inner highlight), `.glass-strong` for hero cards.
- **Hero (`GainersHero`):** 5–6 animated "Short Candidate" cards above the fold — gradient
  border glow on hover, count-up animation on change%, risk-tinted aura. This is the
  centerpiece, not an afterthought.
- **Motion:** Framer Motion for card entrance/stagger, number count-ups, and a live "pulse"
  on the LIVE/DELAYED badge. Keep it tasteful (respect `prefers-reduced-motion`).
- **Typography:** tight, confident — geometric sans for headings (e.g. Geist/Satoshi),
  tabular-nums for all numeric columns so the table doesn't jitter on refresh.
- **`ProGate`:** blurred real AI content + glowing upgrade CTA (visible value = conversion).

---

## Frontend Architecture (Next.js App Router)

```
app/
├── layout.tsx                 # Supabase provider, fonts, gradient-mesh background
├── page.tsx                   # GainersHero + GainersTable (public)
├── history/page.tsx           # date picker (free acct; 30-day soft gate)
├── auth/login | signup/page.tsx
├── pricing/page.tsx           # Pro upsell + Stripe checkout entry
└── api/
    ├── gainers/route.ts            # today's gainers (freshness check → provider)
    ├── gainers/[date]/route.ts     # historical date
    ├── streaks/route.ts
    ├── ai-analysis/route.ts        # validates Pro tier (defense-in-depth + RLS)
    ├── stripe/checkout/route.ts
    ├── stripe/webhook/route.ts     # → profiles.subscription_tier
    └── cron/run-eod/route.ts       # single cron, CRON_SECRET-gated
components/
├── gainers/  GainersHero, GainersTable, GainerRow, StreakBadge, FilterBar, MarketStatusBadge
├── ai/       AIAnalysisCard, RiskLevelBadge, ProGate
└── layout/   Header, GradientMesh
lib/
├── marketdata/ (provider interface — see above)
├── supabase/ client.ts, server.ts, admin.ts
├── claude.ts        # Anthropic SDK + prompt template (from README)
├── streaks.ts       # streak update logic (called from cron)
hooks/  useGainers, useStreaks, useSubscription
stores/ filtersStore.ts   # Zustand: price, cap, streak toggle
middleware.ts             # Supabase session refresh (@supabase/ssr)
```

**MarketStatusBadge:** derived from `is_final` + `scraped_at` stored in Supabase (no
client-side timezone math). Shows LIVE / DELAYED / CLOSED / HISTORICAL.

---

## Freemium Gating
- **Free (no account for basic view):** top 20 gainers table, top 5–6 hero cards, streak
  badges, price ≥ $3 & market cap ≥ $25M filters, last 30 days history (requires free acct —
  soft email gate).
- **Pro ($4.99/mo):** full history, Claude AI short thesis on top 6 (risk level, catalysts,
  recommendation), per-ticker streak history, short watchlist, email alerts (Resend free tier).
- **Payments:** Stripe checkout → webhook → `profiles.subscription_tier = 'pro'`.

---

## Build Sequence

**Phase 0 — Scaffold (0.5 day):** Next.js 14 + TS + Tailwind + shadcn; install deps
(@supabase/ssr, @tanstack/react-query, zustand, @anthropic-ai/sdk, stripe, framer-motion).
Create Supabase project; apply schema + RLS.

**Phase 1 — Data layer (2–3 days):** Build `lib/marketdata/` (types + interface +
`tradingview.ts` + `polygon.ts` + normalize). Build `api/cron/run-eod` + freshness check in
`api/gainers`. Test both providers manually, verify rows + streaks land in Supabase. Configure
`vercel.json` cron + `CRON_SECRET`.

**Phase 2 — Core frontend + design system (3–4 days):** Glassmorphism theme + GradientMesh +
motion; `useGainers`; GainersTable/GainerRow/StreakBadge; GainersHero; FilterBar + Zustand;
MarketStatusBadge.

**Phase 3 — Auth + gates (2–3 days):** Supabase Auth, login/signup, `middleware.ts`,
`useSubscription`, `ProGate`, history route + 30-day free limit.

**Phase 4 — AI (2 days):** `lib/claude.ts` + prompt, EOD cron AI step, AIAnalysisCard +
RiskLevelBadge, verify RLS Pro gating.

**Phase 5 — Payments (2 days):** Stripe product ($4.99/mo), checkout + webhook → tier update.

**Phase 6 — Commercial cutover (when monetizing):** set `MARKET_DATA_PROVIDER=polygon` +
`POLYGON_API_KEY`, verify coverage parity, ship. No code rewrite.

---

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MARKET_DATA_PROVIDER            # tradingview | polygon   (default tradingview)
POLYGON_API_KEY                 # only when provider=polygon
ANTHROPIC_API_KEY
CRON_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RESEND_API_KEY                  # Pro email alerts (optional, later)
```

---

## Verification
- Set `MARKET_DATA_PROVIDER=tradingview`, hit `api/cron/run-eod` with `CRON_SECRET` →
  confirm ~100 ranked rows in `daily_gainers`, **including extreme low-float runners** (the
  Yahoo failure case). Repeat with `=polygon` → confirm coverage parity.
- After 2+ days of data, confirm `ticker_streaks` increments correctly (O(1) lookup).
- Free user: history blocked past 30 days; AI content blurred behind `ProGate`.
- Simulate Stripe webhook → `profiles.subscription_tier` flips to `pro` → AI visible, history
  unlocked. Confirm `ai_analyses` RLS blocks free users at the DB layer.
- Confirm freshness cache: rapid repeat visits hit cache (no extra upstream calls); call count
  stays ~30–40/day.
- Check Vercel cron logs on next trading day; verify gradient-mesh + hero animations render and
  respect `prefers-reduced-motion`.hness check prevents redundant FMP calls within 4-minute window
