#!/usr/bin/env bash
set -euo pipefail
# Full PostgreSQL restore — run during maintenance window.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/dbname bash scripts/restore-db.sh /path/to/dump.sql.gz

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.sql|backup.sql.gz>"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL required"
  exit 1
fi

BACKUP="$1"
echo "DANGER: This will overwrite target database in DATABASE_URL"
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted"
  exit 2
fi

if [[ "$BACKUP" == *.gz ]]; then
  gunzip -c "$BACKUP" | psql "$DATABASE_URL"
else
  psql "$DATABASE_URL" -f "$BACKUP"
fi

echo "Restore command issued; verify application health and run migrations if needed."
