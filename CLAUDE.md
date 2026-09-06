@AGENTS.md

# Zenith

A daily stock screener for **DECA Stock Market Game** competitors (high-school
students). It surfaces the day's biggest US market gainers — framed as "today's
top short candidates" — ranked, with consecutive-day streaks and Pro-gated
Claude AI short theses. The audience is new to markets, so charts default to a
simple area view (not candlesticks). Status: **near-final, pre-launch polish**
— live on Railway at **zenithscreener.com**; no longer an MVP. Remaining before
launch: a regulatory/branding compliance pass and engine calibration tweaks.

## Stack

- **Next.js 16** App Router + **React 19** + TypeScript
- **Tailwind v4** + **base-ui** primitives (`components/ui/`), dark glassmorphism
- **Supabase** — Postgres + Auth + RLS (`lib/supabase/{client,server,admin}.ts`)
- **TanStack Query v5** (10-min stale/refetch) for reads; **Zustand**
  (`stores/filtersStore.ts`) for filter UI state
- **next-themes** (light / dark / system)
- **Stripe** subscriptions — Zenith Pro, $9.99/mo
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
4. ~20 min after the 16:00 close, the first read **finalizes** the official close
   (`is_final`) and runs end-of-day processing (streaks; theses only as a
   **fallback** if the drop failed) in the background — `lib/eod.ts`.
5. Off-hours / weekends / holidays: serve the last finalized day.

**Write / scheduled** — two idempotent backstops, both reusing the read-path
logic, secured by `CRON_SECRET`:
- **Pre-close drop** `GET /api/cron/pre-close` (~3:30 ET): refresh intraday
  gainers, generate theses, email opted-in Pro users (`runPreCloseProcessing`).
- **EOD finalize** `GET /api/cron/run-eod` (~4:20 ET): finalize the official close
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
- `daily_gainers` — one row per `(date, ticker)`: exchange, price,
  change_percent, volume, relative_volume, market_cap, sector, rank, `is_final`,
  scraped_at. RLS: public read.
- `ticker_streaks` — `ticker`, `streak_count`, `last_seen_date`. RLS: public
  read (the app-level gate lives in `/api/streaks`, which requires a session).
- `ai_analyses` — `(date, ticker)`: short_thesis, risk_level, key_catalysts,
  recommendation, model, denormalized rank/company_name/exchange, the board
  figures at scoring time (`price_at_score`, `change_percent_at_score` — always
  a gain), and the scored session's official close (`scored_day_close`,
  `scored_day_change_percent` — the outcome baseline, and **can be negative**).
  **RLS: Pro only.**

## Conventions & gotchas

- **Service-role client (`lib/supabase/admin.ts`) must NEVER be imported in a
  `"use client"` component** — server components / API routes only. `.env.local`
  is never committed.
- **Auth/session middleware lives in `proxy.ts` (repo root), not
  `middleware.ts`** — Next.js 16 renamed the `middleware` convention to `proxy`
  (export `proxy()`, not `middleware()`). It refreshes the Supabase session
  cookie on every matched request and auth-gates `/history` (redirects to
  `/auth/login?next=…`).
- **The apex `zenithscreener.com` is canonical**; `www` 301s to it via
  `redirects()` in `next.config.ts` (host-matched on `CANONICAL_HOST` from
  `lib/site.ts`). Both are registered as Railway custom domains so both get
  certs, and the old `*.up.railway.app` host stays live as an unlinked fallback.
  Config `redirects` run **before** `proxy.ts` (Next's documented order), so www
  requests never pay for a Supabase session refresh. Session cookies are
  host-only — deliberate, since nothing but the apex serves the app.
- **Never build a redirect from `request.url` in a route handler** — behind
  Railway's proxy it resolves to the container's own listening address, so
  `url.origin` is `http://localhost:$PORT`. `app/auth/callback/route.ts` did
  this and sent every Google sign-in and password reset to
  `localhost:8080` (the session cookie was already set, so returning to the
  site looked signed-in — it hid for months). Redirect against `siteUrl()`;
  `request.url` is only safe for `searchParams`. `proxy.ts` is fine — it emits
  a relative `Location` via `nextUrl.clone()`.
- **The display name is `user_metadata.display_name`, not `full_name`** —
  GoTrue re-merges the OAuth provider's identity payload into `user_metadata`
  on *every* sign-in, and Google's payload includes `name` and `full_name`, so
  anything written there is reverted on the next Google login. `display_name`
  is a key no provider sends. Resolution order lives in `lib/displayName.ts`
  (`storedName` for the edit form, `displayName` for UI chrome) — don't inline
  it, it has two readers and two writers.
- AI theses and `GET /api/ai-analysis` are **Pro-gated** (tier check + RLS).
- **The drop's thesis set and the finalized board are different sets — never
  join them.** `ai_analyses` is written at the ~3:30 drop; `daily_gainers` is
  finalized ~20 min after the close. The day cap in
  `generateAndStoreTopAnalyses` makes the drop's five authoritative for the day,
  so a ticker that climbs into the finalized top five afterwards never gets a
  thesis (2026-09-04: NX, PDEX, HVII) — and a ticker can go the other way and
  leave the board entirely (AIFU, same day: top-5 at 3:30, closed −18.58%).
  `TopFive.tsx` used to render the board and look scores up by ticker, which
  rendered a bare `—` for the first case; it now renders one set or the other
  (Pro post-drop → the scored set, everyone else → the board). Thesis rows carry
  their own figures precisely so no surface has to join.
- **The prune does NOT pin thesis tickers, and must not start again.** It did,
  to stop a thesis pointing at a row the screener didn't list (AEHL,
  2026-08-31) — but nothing ever refreshed a pinned row. Its single firing left
  AIFU at rank 98, +5.603%, `is_final = false` on a day it closed −18.58%: a
  fabricated gainer in the product's core table, which `recordThesisOutcomes`
  then skipped (it requires `is_final`), silently dropping exactly the intraday
  reversals calibration most needs. The fix is `scored_day_close` on the thesis
  row — written by `recordScoredDayCloses` at finalize, and the outcome baseline
  in place of the old `daily_gainers` join. `partial_finalize` alerts if a
  non-final row ever survives a finalized day again (`eod_not_finalized` cannot:
  its check is `.some(r => r.is_final)`, which one good row satisfies).
- **Charts and streak badges require an account** — `ChartDialog` renders a
  sign-up gate for signed-out visitors (the TradingView widget is client-side;
  there's no chart API to gate server-side), and `GET /api/streaks` returns an
  empty list without a session (200, not 401 — `useStreaks` would retry-spam a
  401). The Pro `/analysis` chart embeds are already behind auth.
- **TradingView is the sole market-data source** — an undocumented endpoint with
  ToS risk. There's no provider fallback; revisit the licensing/source question
  before any commercial scale. The `MarketDataProvider` interface stays as the
  seam if another source is added.
- **A bare ticker is NOT an identifier** — symbols collide across venues and
  get reused across companies (the BIOT incident, 2026-07-24: a day-one Nasdaq
  listing whose bare symbol the chart widget resolved to a BitMEX crypto
  index). Every symbol string handed to an external system must be qualified
  via `lib/marketdata/symbols.ts` (`qualifiedSymbol`, exchange plumbed
  provider → DB → UI/quant). Guard rails: `persistGainers` drops/alerts rows it
  can't qualify (`symbol_integrity` alert), and EDGAR lookups cross-check the
  SEC registrant name against the scanner's company name
  (`lib/quant/identity.ts`) — a ticker the SEC map attributes to a different
  company yields *no* catalyst rather than the wrong company's filings.
  Finnhub headlines are guarded by `mentionsCompany` in `lib/quant/news.ts`.
- **Branding:** cyan→teal + polar-white on near-black (logo
  `components/layout/Logo.tsx`, favicon `app/icon.png`). Tokens
  `--brand`/`--brand-2`/`--up`/`--down` in `app/globals.css` (light `:root` +
  `.dark`). Decorative accents/glows/CTAs use **brand cyan/white**; **green only
  for semantic meaning** (gains, "market live", low-risk) — never decorative.

## Security model

- **There are NO client-side writes. None.** Every mutation goes through an API
  route on the service role. `profiles` deliberately has no UPDATE policy, and
  `revoke insert, update, delete` is applied to `anon`/`authenticated` across
  the whole public schema (plus `alter default privileges` so new tables
  inherit it). This is not stylistic. RLS gates *rows*, not *columns*, so the
  old `profiles_update_own` policy (`for update using (auth.uid() = id)`) let
  any signed-in user run
  `supabase.from('profiles').update({ subscription_tier: 'pro' })` from
  devtools with the public anon key — free Pro forever — or plant someone
  else's `stripe_customer_id` on their own row and open that person's Stripe
  Billing Portal. **To add a user-editable field, add an API route that
  whitelists the columns — do not add a write policy.**
- **The RLS fix is in `supabase/migrate.sql` and must be RUN.** Deploying the
  code does nothing to a live database on its own.
- **Rate limiting is in-memory** (`lib/ratelimit.ts`) and therefore
  **per-process** — correct only because Railway runs a single replica, the
  same constraint the `node-cron` scheduler already imposes. Counters reset on
  deploy. If this ever scales past one replica, `checkLimit` is the single
  function to repoint at Upstash. `/api/gainers` is deliberately loose (240/min
  per IP): a whole DECA classroom shares one school NAT address.
- **`requireSameOrigin` (`lib/csrf.ts`) guards cookie-authed mutations** —
  favorites, feedback, both Stripe POSTs. Do NOT add it to the Stripe webhook
  (signature-authed, no Origin) or the cron routes (bearer-authed) or
  `/api/auth/google-callback` (Google posts it from accounts.google.com).
- **Google sign-in runs through Google Identity Services, not
  `signInWithOAuth`** — `lib/googleIdentity.ts` +
  `components/auth/GoogleIdentityButton.tsx` +
  `/api/auth/{google-nonce,google-callback}`. Supabase's redirect flow sends the
  browser to `<project-ref>.supabase.co`, and Google names that host on the
  consent screen; it only shows an app *name* to verified brands, and
  `supabase.co` isn't ours to verify. GIS issues the token against our own JS
  origin, so the screen reads `zenithscreener.com`. Four things that are load-
  bearing and look optional:
  - **`ux_mode: "redirect"` for every browser.** iOS Safari's ITP requires it;
    using it everywhere keeps one code path and avoids relaxing
    `Cross-Origin-Opener-Policy: same-origin`, which popup mode would force.
  - **The nonce cookie is `SameSite=None; Secure`.** Google's POST back is a
    cross-site top-level POST and `Lax` cookies are withheld from those — with
    `Lax` this fails on 100% of production sign-ins while looking correct.
  - **CSP needs `form-action https://accounts.google.com`.** GIS navigates by
    form submission and Chrome enforces `form-action` across redirects; `'self'`
    alone blocks Google sign-in in Chrome only.
  - **The callback redirects with 303**, not the `NextResponse.redirect`
    default of 307, which would re-POST the body to the destination page.
  `GoogleButton.tsx` (the old flow) is retained as the fallback for in-app
  webviews, where Google doesn't support GIS. `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  unset ⇒ every user takes that fallback.
- **`/api/unsubscribe`: GET renders, POST mutates.** GET used to flip the flag,
  which meant Outlook SafeLinks and other mail scanners silently unsubscribed
  people by pre-fetching the link. The emails send RFC 8058
  `List-Unsubscribe-Post` headers so native mail-client unsubscribe still works
  in one click.
- **CSP allows `'unsafe-inline'` for scripts** (`next.config.ts`) — a conscious
  tradeoff, since nonces would force every page dynamic and the app renders no
  user-generated HTML (no `dangerouslySetInnerHTML` anywhere). **If
  user-authored content ever gets rendered as HTML, move to a nonce first.**
- **Security events log as single-line JSON** (`lib/seclog.ts`,
  `{"kind":"security",…}`); spikes escalate to one `security_spike` ops email
  per day via `maybeAlert`. Grep Railway logs for `'"kind":"security"'`.
- **Email confirmation is ON, and unconfirmed accounts are pruned.** A signup
  creates the `auth.users` row (and, via `handle_new_user`, a `profiles` row)
  *before* the address is confirmed — so profiles can hold accounts that can
  never sign in. `profiles.email_confirmed_at` is mirrored from `auth.users` by
  trigger (PostgREST can't join into the `auth` schema) so recipient queries and
  user counts can tell the difference, and
  `lib/pruneUnconfirmed.ts` deletes unconfirmed accounts hourly once they're 24h
  past their **last confirmation email** — `confirmation_sent_at`, not
  `created_at`, so a resend buys a fresh window instead of being deleted an hour
  later. Deleting the auth user cascades to `profiles`/`favorites`;
  `feedback.user_id` is `on delete set null`, so bug reports outlive their
  author. The job refuses to act above 100 rows (`prune_anomaly` alert) — it's
  the only irreversible operation here and it runs unattended.
- **All user-triggered auth email goes through `/api/auth/email`**, never
  browser→Supabase directly, so it passes `lib/ratelimit.ts` and lands in the
  security log. Three budgets: 3/hr per address, 5/hr per IP, **15/hr globally**.
  The global one matters — **signups bypass this route entirely**
  (`SignupForm` calls `supabase.auth.signUp` client-side), so the route
  claims part of the budget and leaves the rest for people creating accounts.
  **These three are hourly and the cap they protect is now daily — see the next
  bullet; the reservation they were sized for no longer exists.**
- **Two email ceilings, and BOTH are daily.** Supabase caps auth email at
  **50/day** (dashboard, free to raise — lowered from 50/hour by the user,
  2026-09-04). **Resend's free tier caps *everything* at 100/day** — auth email
  *plus* the pre-close drop *plus* ops alerts. So the real budget is: at most
  **50 auth emails/day**, and at most **100 emails/day in total**. The
  consequences are not symmetric:
  - **Auth email now hits Supabase first, not Resend.** The old note here said
    Resend was the binding constraint; for signups, confirmations and resets
    that is no longer true — 50 < 100, and auth can never exhaust Resend on its
    own any more.
  - **50/day is ~2/hour sustained**, but nothing enforces it hourly. A DECA
    classroom signing up in one period can spend the whole day's auth budget in
    minutes, and every later signup that day gets no confirmation email and
    therefore cannot sign in. This is the most likely way launch day breaks.
  - **The drop still eats the Resend pool.** One email per Pro subscriber per
    trading day, so past ~50 Pro the drop plus a full auth day exceeds 100 and
    Resend starts refusing regardless of what Supabase allows.
  They're alerted separately (`auth_email_rate_limited` vs
  `resend_quota_exhausted`) because one is a toggle and the other is a billing
  decision.
- **Recovery + backups: `docs/RECOVERY.md`**, `scripts/backup-db.sh`,
  `scripts/restore-rehearsal.sh`. The backups are **unproven until the
  rehearsal table in that doc has a row.**

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
- `STRIPE_PRICE_ID` — the Stripe **Price** object for Zenith Pro ($9.99/mo).
  `create-checkout` fails closed without it (500) rather than falling back to an
  inline price. **Mode-specific**: the test and live ids are different objects,
  so `.env.local` holds the test one and Railway the live one; crossing them
  yields `resource_missing` at checkout. The amount now lives in the Stripe
  dashboard, not in the repo — changing it there changes what customers are
  charged with no deploy.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — the Google Identity Services web client ID.
  Public by design, but `NEXT_PUBLIC_*` is inlined at BUILD time, so a Railway
  change needs a rebuild, not a restart. Unset ⇒ auth pages silently fall back
  to the Supabase redirect flow (and its `supabase.co` consent screen).
- `CRON_SECRET` (Vercel cron sends `Authorization: Bearer $CRON_SECRET`)
- `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` (optional — scraper
  failure alerts via `lib/alerts.ts`; if unset, alerts log to console only, no
  email. Dedup + audit log live in the `system_alerts` table.) `ALERT_EMAIL_FROM`
  also sends the pre-close drop; its `onboarding@resend.dev` default is Resend's
  **sandbox sender and only delivers to the Resend account owner**, so it must be
  a verified `@zenithscreener.com` address in production.
- `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` — the public base URL, read
  **only** via `siteUrl()` in `lib/site.ts` (SITE first, APP as fallback, then
  `localhost:3000` for dev). Never read either directly: the old split, where
  `layout.tsx` read one and the Stripe routes read the other, left
  `metadataBase` resolving to localhost in production. Both are `NEXT_PUBLIC_*`
  and therefore **inlined at build time** — changing them on Railway needs a
  rebuild, not a restart.

## Commands

- `npm run dev` — dev server (run **one** only; a second instance causes a
  port-conflict mess)
- `npm run build` / `npm run start` / `npm run lint`
- DB setup: run `supabase/schema.sql` (new) or `supabase/migrate.sql` (existing)
  in the Supabase SQL editor.
- Trigger pre-close drop / EOD locally:
  `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/pre-close`
  `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/run-eod`
