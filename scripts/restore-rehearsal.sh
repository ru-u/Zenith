#!/usr/bin/env bash
#
# Restore rehearsal — restores a dump into a THROWAWAY LOCAL database and
# checks that what came back is actually usable.
#
# This script is the backup. The nightly dump is just a file until a restore
# has been performed at least once; until then you have a compressed blob of
# unknown validity and a belief.
#
# Usage:
#   ./scripts/restore-rehearsal.sh                       # pull latest from R2
#   ./scripts/restore-rehearsal.sh zenith-2026-08-26.sql.gz   # a local file
#
# Requires a local Postgres (brew install postgresql@16 && brew services start
# postgresql@16). It NEVER touches production: the target is always a local
# database named zenith_rehearsal, dropped and recreated each run.
#
set -Eeuo pipefail

REHEARSAL_DB="zenith_rehearsal"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

command -v psql >/dev/null || { echo "psql not installed" >&2; exit 1; }

if [[ -n "${1:-}" && -f "${1:-}" ]]; then
  DUMP="$1"
  echo "[rehearsal] using local dump: $DUMP"
else
  : "${R2_BUCKET:?set R2_BUCKET (or pass a local dump path)}"
  : "${R2_ENDPOINT:?set R2_ENDPOINT}"
  KEY="${1:-}"
  if [[ -z "$KEY" ]]; then
    KEY=$(aws s3 ls "$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" \
      | awk '{print $4}' | grep -E '^zenith-[0-9-]+\.sql\.gz$' | sort | tail -1)
    [[ -n "$KEY" ]] || { echo "no dumps found in $R2_BUCKET" >&2; exit 1; }
  fi
  echo "[rehearsal] downloading $KEY …"
  DUMP="$WORKDIR/$KEY"
  aws s3 cp "$R2_BUCKET/$KEY" "$DUMP" --endpoint-url "$R2_ENDPOINT"
fi

echo "[rehearsal] recreating local database $REHEARSAL_DB …"
dropdb --if-exists "$REHEARSAL_DB"
createdb "$REHEARSAL_DB"

# The dump references the auth schema (auth.users) and pgcrypto's
# gen_random_uuid default on profiles.unsubscribe_token. Neither exists in a
# bare local database, so create them before restoring or every insert fails.
psql -q -d "$REHEARSAL_DB" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create extension if not exists pgcrypto;
SQL

echo "[rehearsal] restoring …"
# Not ON_ERROR_STOP: a Supabase dump always trips a few harmless statements
# locally (missing roles in leftover GRANTs, supabase-specific extensions).
# The verification below is what decides pass/fail, not psql's exit code.
gunzip -c "$DUMP" | psql -q -d "$REHEARSAL_DB" > "$WORKDIR/restore.log" 2>&1 || true

ERRORS=$(grep -c "^ERROR:" "$WORKDIR/restore.log" || true)
echo "[rehearsal] restore finished with ${ERRORS} psql error line(s)"
[[ "$ERRORS" -gt 0 ]] && grep "^ERROR:" "$WORKDIR/restore.log" | sort | uniq -c | sort -rn | head -10

echo
echo "[rehearsal] ── verification ──"

# Row counts alone can pass on a schema that restored without its data, so
# check both structure and contents of the tables that matter.
psql -d "$REHEARSAL_DB" -v ON_ERROR_STOP=1 <<'SQL'
\timing off
\pset border 2
select 'profiles'       as table, count(*) from public.profiles
union all select 'daily_gainers',  count(*) from public.daily_gainers
union all select 'ai_analyses',    count(*) from public.ai_analyses
union all select 'ticker_streaks', count(*) from public.ticker_streaks
union all select 'favorites',      count(*) from public.favorites
union all select 'auth.users',     count(*) from auth.users
order by 1;

-- The screener is worthless without a most-recent trading day.
select max(date) as latest_gainers_date, count(distinct date) as days_stored
from public.daily_gainers;

-- Referential sanity: every profile must still map to a real auth user.
select count(*) as orphaned_profiles
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null;
SQL

echo
echo "[rehearsal] PASS if: counts are non-zero, latest_gainers_date is recent,"
echo "            and orphaned_profiles = 0."
echo "[rehearsal] Inspect further with:  psql -d $REHEARSAL_DB"
echo "[rehearsal] Clean up with:         dropdb $REHEARSAL_DB"
