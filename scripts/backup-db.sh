#!/usr/bin/env bash
#
# Nightly logical backup of the Supabase Postgres database to off-platform
# object storage.
#
# WHY OFF-PLATFORM: Supabase's own automated backups are a fine first line, but
# they live in the same account as the thing they protect. They do not help
# with the two failure modes most likely to actually happen here — a billing
# lapse or account lockout taking the project offline, and a mistaken
# destructive migration replicating into the managed backup before anyone
# notices. A dump in a different vendor's bucket survives both.
#
# Usage:
#   ./scripts/backup-db.sh
#
# Required environment:
#   SUPABASE_DB_URL   Postgres connection string. Supabase dashboard →
#                     Project Settings → Database → Connection string → URI.
#                     Use the SESSION POOLER or direct connection, not the
#                     transaction pooler (port 6543): pg_dump needs prepared
#                     statements and will fail against it.
#   R2_BUCKET         e.g. s3://zenith-backups
#   R2_ENDPOINT       e.g. https://<account>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   R2 API token credentials
#
# Optional:
#   RETAIN_DAYS       prune remote dumps older than this (default 30)
#   ALERT_WEBHOOK     URL to POST to when a backup fails
#
set -Eeuo pipefail

fail() {
  echo "[backup] FAILED: $*" >&2
  # A backup job that fails silently is indistinguishable from one that never
  # ran — which is exactly how people discover they have no backups.
  if [[ -n "${ALERT_WEBHOOK:-}" ]]; then
    curl -fsS -X POST "$ALERT_WEBHOOK" \
      -H 'content-type: application/json' \
      -d "{\"text\":\"Zenith DB backup FAILED: $*\"}" >/dev/null 2>&1 || true
  fi
  exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}"
: "${R2_BUCKET:?set R2_BUCKET}"
: "${R2_ENDPOINT:?set R2_ENDPOINT}"

command -v pg_dump >/dev/null || fail "pg_dump not installed (brew install libpq / apt install postgresql-client)"
command -v aws     >/dev/null || fail "aws cli not installed"

STAMP="$(date -u +%F)"
WORKDIR="$(mktemp -d)"
DUMP="$WORKDIR/zenith-$STAMP.sql.gz"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[backup] dumping public schema + auth.users …"

# --no-owner / --no-privileges: the dump restores into a local rehearsal
# database that has no `supabase_admin`, `anon`, or `authenticated` roles, and
# ownership statements referencing missing roles abort the restore. Grants and
# RLS policies are re-established from supabase/schema.sql, which is the
# authority on them anyway.
#
# auth.users is included deliberately: profiles.id is a foreign key into it, so
# a public-schema-only dump restores into a database where every user row is an
# orphan and nobody can log in.
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --table=auth.users \
  --quote-all-identifiers \
  | gzip -9 > "$DUMP"

SIZE=$(wc -c < "$DUMP" | tr -d ' ')
# A gzipped dump of a live schema is never this small. Catching a truncated or
# empty dump here beats discovering it during a restore.
[[ "$SIZE" -gt 2048 ]] || fail "dump is only ${SIZE} bytes — refusing to upload"

echo "[backup] uploading ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")) …"
aws s3 cp "$DUMP" "$R2_BUCKET/zenith-$STAMP.sql.gz" --endpoint-url "$R2_ENDPOINT" \
  || fail "upload to $R2_BUCKET failed"

# Verify it is actually there and non-empty, rather than trusting the exit code.
aws s3 ls "$R2_BUCKET/zenith-$STAMP.sql.gz" --endpoint-url "$R2_ENDPOINT" >/dev/null \
  || fail "uploaded object not found on readback"

RETAIN_DAYS="${RETAIN_DAYS:-30}"
CUTOFF=$(date -u -d "-${RETAIN_DAYS} days" +%F 2>/dev/null || date -u -v-"${RETAIN_DAYS}"d +%F)
echo "[backup] pruning dumps older than $CUTOFF …"
aws s3 ls "$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | while read -r key; do
  [[ "$key" =~ ^zenith-([0-9]{4}-[0-9]{2}-[0-9]{2})\.sql\.gz$ ]] || continue
  if [[ "${BASH_REMATCH[1]}" < "$CUTOFF" ]]; then
    aws s3 rm "$R2_BUCKET/$key" --endpoint-url "$R2_ENDPOINT" >/dev/null && echo "[backup]   pruned $key"
  fi
done

echo "[backup] OK — zenith-$STAMP.sql.gz"
