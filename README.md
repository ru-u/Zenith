<div align="center">

# ⚡ Zenith

**The day's biggest stock-market gainers, ranked — built for shorting the top movers.**

Zenith surfaces the largest daily NASDAQ/NYSE gainers (including the extreme low-float
runners), tracks how many days each name keeps appearing, and pairs the top movers with
an AI-generated short thesis. Built for DECA stock-market-game students hunting short
candidates over a multi-month competition.

</div>

---

## Features

- **Top gainers, ranked** — full-market scan filtered to NASDAQ/NYSE common stock (1–4 letter
  tickers, price ≥ $3, market cap ≥ $25M), ranked by % change. No OTC noise.
- **Streak tracking** — how many consecutive trading days a ticker has shown up as a top mover
  (handles the Fri→Mon weekend gap).
- **AI short theses (Pro)** — Claude Sonnet 4.6 generates a risk level, key catalysts, and a
  recommendation for the top 5 movers each day, cached per ticker/day.
- **History** — browse past trading days (free: last 5 days; Pro: unlimited).
- **Market status** — live session badge (Market open / closed) with a countdown to the
  4 PM ET close and a "Live as of {time}" freshness stamp. Data is regular-session only.
- **Bold glassmorphism UI** — animated gradient mesh, frosted hero cards, count-up animations,
  `tabular-nums` columns; respects `prefers-reduced-motion`.

## Freemium

| | Free | Pro ($4.99/mo) |
|---|---|---|
| Top-50 table + hero cards + streaks | ✅ | ✅ |
| History | last 5 days | unlimited |
| Claude AI short theses | blurred teaser | ✅ full |
| Watchlist & email alerts | — | ✅ (roadmap) |

Gating is enforced both in API routes and at the database layer via Supabase RLS.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui + Framer Motion |
| State | Zustand (filters) + TanStack Query (cache/refetch) |
| DB + Auth | Supabase (Postgres + Auth + RLS) |
| Market data | **Swappable provider**: TradingView scanner (MVP) → Polygon.io Starter (prod) |
| AI | Anthropic `claude-sonnet-4-6` (structured outputs) |
| Payments | Stripe Checkout + webhooks |
| Hosting | Vercel |

---

## Architecture

### Swappable market-data provider

Everything downstream (cron, cache, API, UI) speaks one normalized `GainerRow` shape, so the
data source is a single env var with no rewrite:

```
lib/marketdata/
├── types.ts        # GainerRow, MarketDataProvider interface
├── index.ts        # getProvider() — reads MARKET_DATA_PROVIDER
├── tradingview.ts  # MVP: POST scanner.tradingview.com/america/scan (free, near-real-time)
├── polygon.ts      # Prod: full-market snapshot → rank locally (15-min delayed, commercial)
└── normalize.ts    # shared rank + filters (exchange/ticker/price/market-cap)
```

`MARKET_DATA_PROVIDER=tradingview` (default) or `polygon`. TradingView is fine for a free,
pre-revenue MVP; flip to Polygon before charging money for a commercial-licensed source.

### Refresh strategy — fetch-on-demand + shared cache

`GET /api/gainers` returns cached rows when they're < 10 min old; otherwise it claims an atomic
`claim_fetch` lock (thundering-herd guard) and refreshes from the provider, so concurrent
visitors share a single upstream fetch. On provider failure it serves the last cached rows
flagged stale — never a 500. Writes are **self-pruning**: rows for a date whose ticker drops out
of the current ranked set are removed.

A single **Vercel cron** (`5 21 * * 1-5` UTC ≈ just after the 4:00 PM ET close) finalizes the
day: persists `daily_gainers` with `is_final = true`, updates streaks (O(1) per ticker), and
generates the top-5 AI theses.

### Routes

```
app/
├── page.tsx                 # hero + AI theses + filterable table
├── history/                 # date browser (auth-gated, 5-day free limit)
├── auth/login | signup/
├── upgrade/                 # Stripe checkout entry
└── api/
    ├── gainers/             # today (freshness + guard) and /[date]
    ├── streaks/
    ├── ai-analysis/         # Pro-gated (route check + RLS)
    ├── stripe/{create-checkout,webhook}/
    └── cron/run-eod/        # CRON_SECRET-gated
```

---

## Getting Started

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # server-only
MARKET_DATA_PROVIDER=tradingview   # tradingview | polygon
POLYGON_API_KEY=                   # only when provider=polygon
ANTHROPIC_API_KEY=
CRON_SECRET=                       # long random string
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database

Run [`supabase/schema.sql`](supabase/schema.sql) on a fresh project, or
[`supabase/migrate.sql`](supabase/migrate.sql) (idempotent, non-destructive) on an existing one.
This creates the four tables, RLS policies, the `claim_fetch` guard, and the `handle_new_user`
trigger that auto-creates a profile on signup.

### 4. Run

```bash
npm run dev      # http://localhost:3000
```

Seed today's data without waiting for the cron:

```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run-eod
```

### Stripe (local)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# put the printed whsec_... into STRIPE_WEBHOOK_SECRET
```

---

## Data Model

| Table | Purpose |
|---|---|
| `profiles` | extends `auth.users`; `subscription_tier`, `stripe_customer_id` |
| `daily_gainers` | one row per ticker/day; `is_final`, `scraped_at`, rank + metrics |
| `ticker_streaks` | consecutive-day appearance count per ticker (O(1) updates) |
| `ai_analyses` | Pro-gated Claude theses; `risk_level`, `key_catalysts[]`, recommendation |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (typecheck + compile) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

---

## Notes

- TradingView's ToS prohibits scraping/commercial use of its data — acceptable for a free
  pre-revenue MVP, but switch `MARKET_DATA_PROVIDER` to `polygon` before monetizing.
- Market data is delayed/near-real-time by design; the DECA game runs on delayed quotes.
- Not financial advice — Zenith is an educational tool for a simulated competition.
