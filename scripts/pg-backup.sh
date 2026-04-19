#!/usr/bin/env bash
# Stage-G — Safari ERP PostgreSQL backup script.
#
# Produces a compressed custom-format dump (pg_dump -Fc) that can be
# restored selectively or in full via pg_restore. The script is
# intentionally minimal so it can be scheduled by cron / systemd-timer
# or GitHub Actions without further wrapping.
#
# Environment variables (all required unless noted):
#   DATABASE_URL          PostgreSQL connection string. Prefer a
#                         read-only replica user with CONNECT + USAGE +
#                         SELECT on all tables.
#   BACKUP_DIR            Destination directory (absolute path).
#   BACKUP_RETENTION_DAYS Optional. Defaults to 14. Files older than
#                         this are deleted AFTER a successful run.
#
# Produces, per run:
#   $BACKUP_DIR/safari-erp_YYYYMMDD_HHMMSS.dump
#   $BACKUP_DIR/safari-erp_YYYYMMDD_HHMMSS.dump.sha256
#
# Verification (MUST be run at least weekly to trust the backup chain):
#   pg_restore --list <file>.dump | head   # confirm schema objects
#   sha256sum -c <file>.dump.sha256        # confirm file integrity
#
# Full restore (DESTRUCTIVE — use a test DB):
#   createdb safari_restore
#   pg_restore --clean --if-exists --no-owner \
#     -d "postgres://.../safari_restore" <file>.dump

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/safari-erp_${STAMP}.dump"
SHA_FILE="${OUT_FILE}.sha256"

echo "[pg-backup] Starting dump → $OUT_FILE"
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=9 \
  --file="$OUT_FILE"

echo "[pg-backup] Computing SHA-256 checksum"
sha256sum "$OUT_FILE" > "$SHA_FILE"

# Minimal sanity check: pg_restore --list must succeed on a good dump.
echo "[pg-backup] Verifying dump is readable"
pg_restore --list "$OUT_FILE" > /dev/null

echo "[pg-backup] Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'safari-erp_*.dump' -type f -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'safari-erp_*.dump.sha256' -type f -mtime +"$RETENTION_DAYS" -delete

echo "[pg-backup] OK — $OUT_FILE"
