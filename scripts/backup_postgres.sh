#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/forkfit/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
PG_DUMP_URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/forkfit-$timestamp.sql.gz"
temporary="$target.tmp"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT

pg_dump "$PG_DUMP_URL" | gzip -9 > "$temporary"
mv "$temporary" "$target"
find "$BACKUP_DIR" -type f -name 'forkfit-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "$target"
