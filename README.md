# Zenith
# Zenith MVP — Implementation Plan

## Context
Building a greenfield Next.js 14 stock screener for DECA stock market game students. The repo currently contains only a README.md. The product surfaces top daily gainers, enables students to identify short candidates, and monetizes via a $4.99/month Pro tier that unlocks Claude AI analyses. Stack: Next.js 14 App Router + TypeScript, Tailwind + shadcn/ui, Supabase (DB + Auth), FMP free-tier API, Anthropic Claude Haiku, Vercel Hobby, Stripe.

---

## Build Sequence

### Phase 0 — Project Scaffolding
1. `npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --no-git`
2. Install runtime deps: `@supabase/supabase-js @supabase/ssr @tanstack/react-query @tanstack/react-query-devtools zustand @anthropic-ai/sdk stripe @stripe/stripe-js resend date-fns clsx tailwind-merge`
3. `npx shadcn@latest init` (Default style, Slate base color, CSS variables yes)
4. `npx shadcn@latest add badge button card dialog sheet skeleton table tabs tooltip select`
5. Create `.env.local` (all 9 env vars listed below — never committed)
6. Create `vercel.json` with two crons: `fetch-gainers` at `5 21 * * 1-5` and `run-ai-analysis` at `15 21 * * 1-5` (UTC, weekdays only)
7. Extend `tailwind.config.ts` with `glass` color tokens and `radial-dark` background gradient
8. Set `app/globals.css` with dark glassmorphism base: `.glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1) }`

### Phase 1 — Supabase Foundation
**Files:** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/types.ts`

- `client.ts` → `createBrowserClient` from `@supabase/ssr`
- `server.ts` → `createServerClient` with `cookies()` from `next/headers`
- `admin.ts` → bare `createClient` with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS; server-only)
- `types.ts` → TypeScript interfaces for `Profile`, `DailyGainer`, `TickerStreak`, `AIAnalysis`, `SubscriptionTier`, `RiskLevel`

**SQL to run in Supabase Dashboard:**
- Full schema (4 tables: `profiles`, `daily_gainers`, `ticker_streaks`, `ai_analyses`) as specified in MVP plan
- Add `stripe_customer_id TEXT` to `profiles` for cancellation webhook support
- Enable RLS on all tables; add public-read policies on `daily_gainers` and `ticker_streaks`
- Add trigger `handle_new_user()` to auto-create `profiles` row on `auth.users` insert
- `ai_analyses` RLS policy: pro users only (as specified)

### Phase 2 — Core Library Modules
**Files:** `lib/fmp.ts`, `lib/market-calendar.ts`, `lib/streaks.ts`, `lib/claude.ts`

**`lib/fmp.ts`**
- `fetchTopGainers()` → `GET /api/v3/stock_market/gainers?apikey=...`, sort by `changesPercentage` desc, return top 20
- `fetchQuotesBatch(tickers[])` → `GET /api/v3/quote/{symbols}`, returns `{ sector, relativeVolume }` per ticker

**`lib/market-calendar.ts`**
- `getTodayET()` — converts UTC to ET accounting for DST (no external dependency)
- `getMarketStatus(scrapedAt?, isFinal?)` → `"open" | "closed" | "pre-market" | "after-hours"`
- `isDataStale(scrapedAt, thresholdMinutes=4)` → boolean using `date-fns differenceInMinutes`
- `formatDateKey(date)` → `"YYYY-MM-DD"` string

**`lib/streaks.ts`**
- `updateStreaks(tickers[], date)` → for each ticker, upsert `ticker_streaks`; increment if consecutive (handles Mon after Fri: `dayDiff === 3 && today.getDay() === 1`), else reset to 1

**`lib/claude.ts`**
- `generateAnalysis(gainer: DailyGainer)` → calls `claude-haiku-4-5` with ~800-token prompt, parses JSON response into `AIAnalysisResult { short_thesis, risk_level, key_catalysts, recommendation }`
- Strip markdown code fences before JSON.parse; fallback struct on parse failure

### Phase 3 — Middleware + API Routes
**Files:** `middleware.ts`, all `app/api/` routes

**`middleware.ts`** — Supabase session refresh on all routes; redirect `/history/*` to `/auth/login` if unauthenticated

**API Routes:**

| Route | Auth | Logic |
|---|---|---|
| `GET /api/gainers` | Public | Fetch-on-demand: check `scraped_at` < 4 min → return cache; else call FMP, upsert, return fresh |
| `GET /api/gainers/[date]` | Required (any user) | Return `daily_gainers` for that date |
| `GET /api/streaks` | Public | Return top 50 `ticker_streaks` ordered by `streak_count` desc |
| `GET /api/ai-analysis?date=&ticker=` | Pro only | Validate pro tier from `profiles`, return `ai_analyses` rows |
| `GET /api/cron/fetch-gainers` | CRON_SECRET header | FMP fetch → upsert with `is_final: true` → `updateStreaks()` |
| `GET /api/cron/run-ai-analysis` | CRON_SECRET header | Fetch top 6 final gainers → skip existing analyses → `generateAnalysis()` each with 1.1s delay |
| `POST /api/stripe/create-checkout` | Required | Create Stripe Checkout session; embed `supabase_user_id` in metadata |
| `POST /api/stripe/webhook` | Stripe sig | On `checkout.session.completed`: update `profiles.subscription_tier = 'pro'` |

**Auth pages:** `app/auth/login/page.tsx` + `app/auth/signup/page.tsx` (server shells) + `components/auth/LoginForm.tsx` / `SignupForm.tsx` (client components using `supabase.auth.signInWithPassword` / `signUp`)

### Phase 4 — State Management + Hooks
**Files:** `app/providers.tsx`, `stores/filtersStore.ts`, `hooks/useGainers.ts`, `hooks/useStreaks.ts`, `hooks/useSubscription.ts`

- `providers.tsx` → `QueryClientProvider` with `staleTime: 4min, refetchInterval: 4min` defaults
- `filtersStore.ts` → Zustand: `sector | null`, `searchQuery`, `minChangePercent | null` + setters + `reset()`
- `useGainers()` → TanStack Query → `GET /api/gainers`, 4-min refetch
- `useStreaks()` → TanStack Query → `GET /api/streaks`, 1-hr stale time, no refetch interval
- `useSubscription()` → client-side effect: reads Supabase `profiles.subscription_tier` for current user; returns `{ tier, isPro, loading }`

Update `app/layout.tsx` to wrap `<Header />` + `{children}` in `<Providers>`.

### Phase 5 — UI Components (bottom-up)
Build in dependency order:

1. **`StreakBadge`** — renders `<Flame />` icon + count; hidden if count < 2; orange at 5+, yellow at 3+
2. **`MarketStatusBadge`** — derives status from `getMarketStatus()`; pulsing green dot when open
3. **`RiskLevelBadge`** — color-coded: low=green, medium=yellow, high=orange, extreme=red
4. **`ProGate`** — wraps children in `blur-sm` div + absolute overlay with lock icon + upgrade CTA; renders children directly for pro users. **CRITICAL: content must be visible but blurred, not hidden.**
5. **`FilterBar`** — search input + sector dropdown from Zustand store
6. **`GainerRow`** — table row: rank, ticker+streak badge, company name, price, change%, volume, rel. vol, sector
7. **`GainersTable`** — `useGainers` + `useStreaks` + filter logic from store → renders `GainerRow` list; skeleton loading; empty state
8. **`GainersHero`** — top 6 gainers as glassmorphism cards showing ticker, +X%, price, streak badge; `MarketStatusBadge` in header
9. **`AIAnalysisCard`** — wraps `AIContent` (inner useQuery to `/api/ai-analysis`) in `ProGate`; shows risk badge, thesis, catalysts, recommendation
10. **`Header`** — sticky; logo, History link (auth'd only), sign in/up or user email + sign out

### Phase 6 — Pages
- `app/layout.tsx` — Inter font, dark class, `<Providers>` + `<Header>`
- `app/page.tsx` — `<GainersHero />` + `<GainersTable />` (both client, wrapped in `<Suspense>`)
- `app/history/page.tsx` — server component, auth redirect, fetch 30 most recent final dates from Supabase → pass to `<HistoryBrowser />` client component
- `components/history/HistoryBrowser.tsx` — date list sidebar + `useQuery` to `/api/gainers/[date]` on click → renders `GainersTable` variant for selected date

### Phase 7 — Stripe
- `app/api/stripe/create-checkout/route.ts` — create Stripe Checkout session (subscription, $4.99/mo)
- `app/api/stripe/webhook/route.ts` — verify signature, handle `checkout.session.completed` → update `profiles`
- `app/upgrade/page.tsx` — upgrade CTA page with "Upgrade to Pro" button that POSTs to `/api/stripe/create-checkout` and redirects to Stripe URL

---

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # server-only; never expose to client
FMP_API_KEY
ANTHROPIC_API_KEY
CRON_SECRET                      # >32 chars random string; matches Vercel cron auth header
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
```

---

## Key Implementation Constraints
- `adminClient` (service role) must NEVER be imported in `"use client"` components — only in `app/api/` routes and server components
- All hooks (`useGainers`, `useStreaks`, etc.) are `"use client"` only — no hooks in Server Components
- `ProGate` must show blurred content, not hidden — visible value drives conversion
- Cron routes check `Authorization: Bearer <CRON_SECRET>` header
- FMP budget: 2 calls per on-demand fetch (gainers + batch quotes). At MVP traffic, well within 250/day
- Streak consecutive-day logic: `dayDiff === 1` OR (`dayDiff === 3 && today.getDay() === 1`) for Mon-after-Fri

---

## Verification Checklist
1. Manually call `GET /api/cron/fetch-gainers` with correct `Authorization` header → confirm rows in `daily_gainers`
2. Confirm `ticker_streaks` updates after 2 market days of data
3. Sign up as free user → `/history` accessible, AI analyses blurred, ProGate overlay visible
4. Upgrade via Stripe test mode → Stripe webhook fires → `profiles.subscription_tier = 'pro'` → AI analyses visible
5. Verify `is_final = true` rows persist after cron; intra-day rows show `is_final = false`
6. Check Vercel Function logs for cron executions on next trading day
7. Confirm `scraped_at` freshness check prevents redundant FMP calls within 4-minute window