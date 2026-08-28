# Recovery runbook

What to do when Zenith is broken. Written for the person reading it at 7am
before the market opens, not for the person who wrote it.

**The deadline that matters:** the pre-close drop fires ~3:30pm ET and the
close finalizes ~4:05pm ET. A database restored by 3:00pm ET loses nothing
users can see. After 4:05pm, a missed finalize means that trading day has no
official close and the streak chain has a hole in it — recoverable, but only
by hand (see "Missed a trading day" below).

---

## 0. Triage — which failure is this?

| Symptom | Likely cause | Go to |
|---|---|---|
| Site down / 502 | Bad deploy | [§1](#1-bad-deploy) |
| Site up, screener empty or stale | Provider (TradingView) blocked | [§2](#2-market-data-provider-failure) |
| Data wrong / rows deleted | Bad migration or destructive query | [§3](#3-database-restore) |
| Pro users see no AI theses | Quant pipeline or a missed drop | [§4](#4-missed-a-trading-day) |
| Suspected compromise | Leaked key, anomalous access | [§5](#5-suspected-compromise) |

Check first, in this order: Railway deploy log → `system_alerts` table →
Railway runtime logs filtered to `kind":"security`.

---

## 1. Bad deploy

Railway keeps previous builds. Roll back from the dashboard: **Deployments →
the last known-good build → ⋯ → Redeploy**. This is seconds, and it is almost
always the right first move — diagnose after the site is up, not before.

```bash
railway status                 # what's live right now
railway logs --deployment      # why the current one is unhappy
```

Reminder from `CLAUDE.md`: `NEXT_PUBLIC_*` values are inlined at **build** time.
Changing one on Railway and restarting does nothing — it needs a rebuild.

Run **one replica**. The `node-cron` scheduler in `instrumentation.ts` is
in-process, and the in-memory rate limiter in `lib/ratelimit.ts` is per-process.
The cron jobs are idempotent so a second replica is not a correctness bug, but
it does double the scheduler and halve the effective rate limits.

## 2. Market-data provider failure

TradingView is the sole source and the endpoint is undocumented, so this is a
*when*, not an *if*. The read path already degrades: it serves the last cached
day flagged stale, and `maybeAlert` emails once per day per condition.

There is no failover. If TradingView is blocked for a whole session, that
session has no data and the honest move is to let the stale banner say so.
`lib/marketdata/` keeps the provider interface as the seam for a second source.

## 3. Database restore

**Before restoring anything, snapshot the current broken state.** A restore
overwrites the evidence, and "what exactly did we lose" is unanswerable
afterwards.

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema=public \
  | gzip > "broken-$(date -u +%FT%H%M).sql.gz"
```

Two restore paths, in order of preference:

**a) Supabase PITR / daily backup** (Dashboard → Database → Backups). Fastest,
and it restores in place. Point-in-time recovery is a paid-plan feature — if the
project is on the free tier this option does not exist, which is the reason
`scripts/backup-db.sh` exists.

**b) Off-platform dump** from R2:

```bash
# 1. ALWAYS rehearse into a local throwaway DB first
./scripts/restore-rehearsal.sh

# 2. Only after the rehearsal verification passes, restore for real
aws s3 cp "$R2_BUCKET/zenith-2026-08-26.sql.gz" . --endpoint-url "$R2_ENDPOINT"
gunzip -c zenith-2026-08-26.sql.gz | psql "$SUPABASE_DB_URL"

# 3. Re-apply RLS policies and grants — the dump is taken --no-privileges,
#    so it restores DATA, not the security model. Skipping this leaves tables
#    with RLS off. Run supabase/schema.sql in the SQL editor.
```

Step 3 is the one that gets forgotten. A restored database with RLS disabled is
worse than a broken one: `ai_analyses` is Pro-gated by policy alone.

**After any restore**, verify:

```sql
select max(date) from daily_gainers;              -- most recent trading day present?
select count(*) from profiles where subscription_tier = 'pro';  -- matches Stripe?
select tablename, rowsecurity from pg_tables where schemaname = 'public';  -- all t
select * from pg_policies where schemaname = 'public';          -- policies back?
```

If Pro counts disagree with Stripe, replay from Stripe rather than editing by
hand: Stripe Dashboard → Developers → Webhooks → **Resend** the relevant
`checkout.session.completed` / `customer.subscription.*` events. The webhook is
idempotent.

## 4. Missed a trading day

Both cron jobs are idempotent and safe to re-run — but only usefully on the
same day, since the provider returns *current* quotes, not historical ones.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://zenithscreener.com/api/cron/pre-close
curl -H "Authorization: Bearer $CRON_SECRET" https://zenithscreener.com/api/cron/run-eod
```

If the day is already past, the close cannot be reconstructed from the provider.
The gap stays. Streaks self-heal on the next run (`updateStreaks` only touches
the current day's tickers), but a missing day will have broken any streak that
spanned it — that is a data gap, not a bug to code around.

## 5. Suspected compromise

Order matters: revoke first, investigate second.

1. **Rotate every credential.** Assume all of them, not just the one you think
   leaked.
   - Supabase: Settings → API → roll `service_role` **and** `anon`. Rolling
     `service_role` is the urgent one — it bypasses RLS entirely.
   - Stripe: roll the secret key; roll the webhook signing secret separately.
   - `CRON_SECRET`, `RESEND_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`.
   - Redeploy — `NEXT_PUBLIC_*` changes need a rebuild.
2. **Invalidate sessions.** Supabase Dashboard → Authentication → Users → sign
   out all users. Anyone holding a stolen refresh token loses it.
3. **Check for privilege tampering** — this is what an attacker would go for:
   ```sql
   -- Pro accounts with no Stripe customer: granted outside the payment flow
   select id, email, subscription_tier, stripe_customer_id, updated_at
   from profiles
   where subscription_tier = 'pro' and stripe_customer_id is null;

   -- Duplicate customer ids: one Stripe customer on two profiles
   select stripe_customer_id, count(*) from profiles
   where stripe_customer_id is not null
   group by 1 having count(*) > 1;

   -- Any write policy that shouldn't exist (there should be NO update/insert/
   -- delete policies on profiles at all)
   select * from pg_policies where schemaname = 'public' and cmd <> 'SELECT';
   ```
4. **Read the logs.** Security events are single-line JSON on stdout:
   ```bash
   railway logs | grep '"kind":"security"'
   railway logs | grep '"kind":"security"' | python3 -c "import sys,json,collections
   c=collections.Counter()
   for l in sys.stdin:
       i=l.find('{\"kind\"')
       if i<0: continue
       try: d=json.loads(l[i:])
       except: continue
       c[(d.get('event'),d.get('ip'))]+=1
   [print(n,e,ip) for (e,ip),n in c.most_common(25)]"
   ```
5. **Restore** from a dump predating the incident if data was altered (§3).

---

## Backups: setup and schedule

`scripts/backup-db.sh` writes a gzipped dump to Cloudflare R2 and prunes past
`RETAIN_DAYS` (default 30). It needs `SUPABASE_DB_URL`, `R2_BUCKET`,
`R2_ENDPOINT`, and R2 API credentials.

Use the **session pooler or direct connection** string, not the transaction
pooler on port 6543 — `pg_dump` needs prepared statements and fails against it.

Run it nightly from wherever is easiest to keep honest — a GitHub Actions
scheduled workflow with the credentials as repo secrets, a Railway cron
service, or a laptop `launchd` job. Off-platform matters more than which.

**Rehearse quarterly**, and after any schema change:

```bash
./scripts/restore-rehearsal.sh
```

Log each rehearsal here so the claim has a date attached:

| Date | Dump restored | Result | Notes |
|---|---|---|---|
| _(pending)_ | — | — | First rehearsal not yet run — see caveat below |

> Until that table has a row in it, this project's backups are **unproven**.
> `scripts/backup-db.sh` has never run against the live database and no dump has
> ever been restored. The scripts are syntax-checked, not exercised. Treat
> "we have backups" as false until the first rehearsal passes.
