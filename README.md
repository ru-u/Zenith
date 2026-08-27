<div align="center">

# ⚡ Zenith

**The day's biggest stock-market gainers, ranked — built for shorting the top movers.**

Zenith surfaces the largest daily NASDAQ/NYSE gainers (including the extreme low-float
runners), tracks how many days each name keeps appearing, and pairs the top movers with a
short thesis computed by an in-house quant engine. Built for DECA stock-market-game students
hunting short candidates over a multi-month competition.

*Not investment advice — an educational tool for the DECA Stock Market Game. Not affiliated
with or endorsed by DECA Inc. or the SIFMA Foundation.*

</div>

---

## Features

- **Top gainers, ranked** — full-market scan filtered to NASDAQ/NYSE common stock (1–4 letter
  tickers, price ≥ $3, market cap ≥ $25M), ranked by % change. No OTC noise.
- **Streak tracking** — how many consecutive trading days a ticker has shown up as a top mover
  (handles the Fri→Mon weekend gap).
- **The pre-close drop** — ~30 minutes before the close, Zenith computes a short thesis for the
  top 5 movers and emails opted-in **Pro** subscribers (free accounts get no email for now —
  `lib/notify.ts` filters recipients by tier). That timing is the whole point: in the DECA game a
  trade entered during market hours fills at *that day's close*, so a thesis is only actionable
  if it lands before 4 PM ET.
- **Short theses without the API bill** — risk level, catalyst, a 1–10 short score, and an
  estimated chance the stock closes lower tomorrow — produced by a deterministic quant engine
  (SEC EDGAR + base rates + technicals), not an LLM. $0/day, zero Anthropic calls.
- **History** — browse past trading days (free: last 5 trading days; Pro: unlimited).
- **Market status** — live session badge with a countdown to the 4 PM ET close and a
  "Live as of {time}" freshness stamp. Regular session only.
- **Dark glassmorphism UI** — animated gradient mesh, frosted hero cards, count-up animations,
  `tabular-nums` columns; light/dark/system themes; respects `prefers-reduced-motion`.

## Freemium

| | Free | Pro ($4.99/mo) |
|---|---|---|
| Top-50 table + hero cards + streaks | ✅ | ✅ |
| History | last 5 trading days | unlimited |
| Short theses | blurred teaser | ✅ full |
| Pre-close email drop | — | ✅ full theses |

Gating is enforced both in the API routes and at the database layer via Supabase RLS.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (CSS-first tokens, no config file) + base-ui primitives + Framer Motion |
| State | Zustand (filters, preferences) + TanStack Query (cache/refetch) |
| DB + Auth | Supabase (Postgres + Auth + RLS), email/password + Google OAuth |
| Market data | TradingView scanner (sole provider, behind a swappable interface) |
| Theses | In-house quant engine (`lib/quant/`) — SEC EDGAR + base rates + technicals |
| Payments | Stripe Checkout + billing portal + webhooks |
| Email | Resend (pre-close drop, failure alerts) |
| Hosting | Railway (persistent container, in-process scheduler) |

---

## Architecture

### The thesis engine (`lib/quant/`)

Theses used to come from a Claude Sonnet call per ticker. They now come from a deterministic
pipeline that costs nothing to run:

```
lib/quant/
├── edgar.ts       # SEC EDGAR filings in the move window → catalyst classification
├── score.ts       # base rate + catalyst/technical Δs → short_score, percent_win_estimate
├── technicals.ts  # TradingView indicators (RSI, VWAP, 52w high, intraday fade)
└── thesis.ts      # prose seam ($0 template by default) + the Anthropic spend switch
```

`score.ts` starts from an **empirical base rate** — the realized "closed lower next session"
frequency for this market-cap × relative-volume bucket, backfilled by
`scripts/historical-base-rates.mjs` — then applies catalyst and technical adjustments. The Δ
constants at the top of the file are the entire tuning surface, and they encode the same
heuristics the old LLM prompt spelled out in prose: buyouts pin near the deal price (shorts
rarely win), offerings fade on dilution, real earnings and FDA wins can keep running, squeezes
are violent in both directions.

Prose is a **swappable seam**. The default is a $0 deterministic template. Setting
`AI_PROSE_MODE=haiku` (which *also* requires `AI_THESES_ENABLED=true`) swaps in one plain
Anthropic call over the same structured findings — a config flip, not a rewrite — and silently
falls back to the template on any failure. Rows are self-describing: the stored `model` column
reads `quant-v1` or `quant-v1+haiku`.

> **`AI_THESES_ENABLED` is a hard kill switch for all Anthropic spend.** Absent or anything
> other than `true` = off, so a fresh environment can never surprise you with a bill. The quant
> pipeline is free and runs regardless — theses are computed and the pre-close email sends with the
> switch off.

### Market-data provider

Everything downstream (scheduler, cache, API, UI) speaks one normalized `GainerRow` shape, so
the data source sits behind a single interface and can be swapped without a rewrite:

```
lib/marketdata/
├── types.ts        # GainerRow, MarketDataProvider interface
├── index.ts        # getProvider() — returns the active provider
├── tradingview.ts  # POST scanner.tradingview.com/america/scan (free, near-real-time)
└── normalize.ts    # shared rank + filters (exchange/ticker/price/market-cap)
```

TradingView is the sole provider — an undocumented endpoint with ToS risk, fine for a free,
pre-revenue MVP. Revisit the licensing question before any commercial scale; the
`MarketDataProvider` interface stays as the seam if another source is added.

Two data-quality guards sit on top of it, because the scanner lies in two specific ways:

- **`dropSplitArtifacts`** — TradingView's change% is split-blind on the effective date, which
  produced fake monsters like ENLV at +1414% after a reverse split. A move ≥ 150% on relative
  volume < 5 is a split artifact, not a rally, and gets dropped.
- **`dropFrozenRepeats`** — halted stocks report identical values day over day. Rows that
  repeat exactly are dropped rather than shown as a live mover.

### Read path — `GET /api/gainers` (DB-first)

Read and write paths are deliberately separate; an earlier bug had the browser triggering a
provider call on every render.

1. Serve cached `daily_gainers` for today.
2. During the regular session (9:30–16:00 ET), if the data is stale (> 10 min), claim an atomic
   `claim_fetch` lock (thundering-herd guard), refresh from the provider, and cache it — so
   concurrent visitors share a single upstream fetch. On provider failure it serves the last
   cached rows flagged stale, never a 500. Writes are **self-pruning**: rows for a date whose
   ticker drops out of the ranked set are removed.
3. ~30 min before the close, the **pre-close drop** fires via Next's `after()` — compute the
   top-5 theses off intraday data and email opted-in Pro users. Theses store a
   `rank` so the UI card shows exactly the drop's set.
4. ~5 min after the 16:00 close, the first read **finalizes** the official close (`is_final`) and
   runs end-of-day processing (streaks; theses only as a *fallback* if the drop failed).
5. Off-hours, weekends, and holidays: serve the last finalized day.

### Write path — two scheduled backstops

Both reuse the read-path logic and are secured by `CRON_SECRET`. Both are idempotent (theses
skip existing rows, the email is deduped once per day).

| Endpoint | When | Does |
|---|---|---|
| `GET /api/cron/pre-close` | ~3:30 PM ET | refresh intraday gainers, compute theses, send the email drop |
| `GET /api/cron/run-eod` | ~4:05 PM ET | finalize the official close + streaks (theses fallback) |

On **Railway** these fire from an in-process `node-cron` scheduler (`instrumentation.ts`), armed
in the ET timezone. It runs an **every-5-minute check** rather than a fixed clock time so it
auto-adapts to half-days via the market calendar. **Run a single replica** — the jobs are
idempotent regardless, but one replica means one email. `vercel.json` keeps the run-eod cron
around as a Vercel-deployment fallback.

ET sessions, holidays, and half-days all live in `lib/market-calendar.ts`.

### Routes

```
app/
├── page.tsx                 # landing
├── screener/                # hero + theses + filterable table (the product)
├── analysis/                # Pro thesis detail
├── history/                 # date browser (auth-gated, 5-trading-day free limit)
├── settings/                # account, theme, email opt-in, feedback
├── upgrade/                 # Stripe checkout entry
├── auth/{login,signup}/     # email/password + Google OAuth
├── {privacy,terms,cookies}/ # legal
└── api/
    ├── gainers/             # today (freshness + lock) and /[date]
    ├── streaks/
    ├── ai-analysis/         # Pro-gated (route check + RLS)
    ├── feedback/
    ├── unsubscribe/         # tokenized, no login required
    ├── stripe/{create-checkout,create-portal,webhook}/
    └── cron/{pre-close,run-eod}/   # CRON_SECRET-gated
```

Auth/session middleware lives in **`proxy.ts`**, not `middleware.ts` — Next.js 16 renamed the
convention. It refreshes the Supabase session cookie on every matched request and auth-gates
`/history`.

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
SUPABASE_SERVICE_ROLE_KEY=         # server-only, never import in a client component

CRON_SECRET=                       # long random string; sent as `Authorization: Bearer …`

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

SEC_EDGAR_USER_AGENT=              # SEC requires a contact string, e.g. "Zenith you@example.com"

# Public base URL — read by lib/site.ts siteUrl() in this order. Production is
# https://zenithscreener.com for both. NEXT_PUBLIC_* is inlined at BUILD time,
# so changing these on Railway requires a rebuild, not a restart.
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Anthropic — OFF by default. The quant engine needs none of this.
AI_THESES_ENABLED=                 # kill switch for ALL Anthropic spend; only `true` enables
AI_PROSE_MODE=                     # unset/`template` ($0, default) or `haiku`
ANTHROPIC_API_KEY=                 # only read in haiku prose mode

# Email — pre-close drop + scraper failure alerts (optional; console-only if unset)
RESEND_API_KEY=
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=                  # verified Resend sender, e.g. "Zenith <drops@zenithscreener.com>";
                                   # the onboarding@resend.dev default only reaches the account owner
```

### 3. Database

Run [`supabase/schema.sql`](supabase/schema.sql) on a fresh project, or
[`supabase/migrate.sql`](supabase/migrate.sql) (idempotent, non-destructive) on an existing one.
This creates the tables, RLS policies, the `claim_fetch` guard, and the `handle_new_user`
trigger that auto-creates a profile on signup.

Optionally backfill the base-rate table the scorer reads from:

```bash
node scripts/historical-base-rates.mjs
```

Without it the scorer falls back to a 50% coin-flip prior.

### 4. Run

```bash
npm run dev      # http://localhost:3000 — run ONE instance only
```

Trigger either scheduled job by hand instead of waiting for the clock:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/pre-close
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/run-eod
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
| `profiles` | extends `auth.users`; `subscription_tier`, `stripe_customer_id`, `notify_preclose` (opt-*out*, default on), `unsubscribe_token` |
| `daily_gainers` | one row per ticker/day; `is_final`, `scraped_at`, rank + metrics |
| `ticker_streaks` | consecutive-day appearance count per ticker (O(1) updates) |
| `ai_analyses` | Pro-gated theses; `risk_level`, `key_catalysts[]`, recommendation, `model` |
| `system_alerts` | failure-alert dedup + audit log |

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
  pre-revenue MVP, but it's the sole source with no fallback; revisit the data licensing
  before monetizing.
- Market data is delayed/near-real-time by design; the DECA game runs on delayed quotes.
- `percent_win_estimate` is a base-rate estimate from a small historical sample, not a
  prediction. It is floored at 5% and capped at 95% precisely so it never claims certainty.
- Not financial advice — Zenith is an educational tool for a simulated competition.
