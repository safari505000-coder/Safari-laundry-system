# Safari ERP — Backup & Restore Runbook

**Scope:** PostgreSQL backup strategy, verification, and disaster-recovery
procedure for the Safari ERP production database.

This document is the canonical answer for anyone asking _"how do we
restore if the DB is lost?"_. Keep it under version control and review
it at least quarterly.

---

## 1. Backup policy

| Setting              | Value                                          |
| -------------------- | ---------------------------------------------- |
| Frequency            | Daily at 03:00 Kuwait time (Asia/Kuwait)       |
| Retention            | 14 days rolling on hot storage                 |
| Off-site copy        | Weekly (Sundays) synced to cold storage        |
| Format               | `pg_dump -Fc` (custom compressed format)       |
| Integrity check      | SHA-256 alongside every dump file              |
| Readability check    | `pg_restore --list` runs automatically         |
| End-to-end restore   | At least once per month to a scratch database  |

The script at [`scripts/pg-backup.sh`](../scripts/pg-backup.sh) implements
steps 1–4 of this policy. It is idempotent and safe to re-run.

---

## 2. Scheduling

### Systemd timer (recommended for bare-metal / VPS)

Create `/etc/systemd/system/safari-erp-backup.service`:

```ini
[Unit]
Description=Safari ERP PostgreSQL backup
After=network.target

[Service]
Type=oneshot
Environment=DATABASE_URL=postgres://backup_user:...@localhost:5432/safari_erp
Environment=BACKUP_DIR=/var/backups/safari-erp
Environment=BACKUP_RETENTION_DAYS=14
ExecStart=/opt/safari-erp/scripts/pg-backup.sh
```

And `/etc/systemd/system/safari-erp-backup.timer`:

```ini
[Unit]
Description=Safari ERP daily backup

[Timer]
OnCalendar=*-*-* 00:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

`00:00 UTC` = `03:00 Asia/Kuwait`. Enable with:

```bash
systemctl enable --now safari-erp-backup.timer
```

### GitHub Actions (for off-site cold copy)

Add `.github/workflows/backup.yml`:

```yaml
name: Off-site backup

on:
  schedule:
    - cron: '0 0 * * 0' # every Sunday at 00:00 UTC = 03:00 Kuwait

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run dump
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_READONLY }}
          BACKUP_DIR: ./backups
        run: bash scripts/pg-backup.sh
      - name: Upload to cold storage
        # e.g. rclone → S3 Glacier, Backblaze B2, etc.
        run: rclone copy ./backups cold-remote:safari-erp-backups
```

---

## 3. Verification (weekly)

Run every Sunday on the latest dump:

```bash
cd /var/backups/safari-erp
LATEST=$(ls -1t safari-erp_*.dump | head -1)

# 1. file integrity
sha256sum -c "${LATEST}.sha256"

# 2. pg_restore can read the archive
pg_restore --list "$LATEST" | head

# 3. (monthly) full restore to a throwaway database
createdb safari_restore_check
pg_restore --clean --if-exists --no-owner \
  -d "postgres://localhost/safari_restore_check" "$LATEST"
psql -d safari_restore_check -c "SELECT count(*) FROM \"User\";"
dropdb safari_restore_check
```

Log each verification run — missing logs ⇒ treat the backup as
untrusted.

---

## 4. Restore procedure (production emergency)

```bash
# 1. Stop the API so no new writes happen.
systemctl stop safari-erp-api

# 2. Take a last-ditch dump of the current (possibly corrupt) DB for
#    forensic analysis BEFORE overwriting.
pg_dump "$DATABASE_URL" -Fc > /tmp/pre-restore-$(date +%F).dump

# 3. Drop & recreate the target database.
dropdb safari_erp
createdb safari_erp

# 4. Restore from the chosen dump.
pg_restore --clean --if-exists --no-owner \
  -d "postgres://user:pass@host/safari_erp" /path/to/safari-erp_YYYYMMDD_HHMMSS.dump

# 5. Run Prisma migrations in case the dump predates the current
#    schema version.
cd /opt/safari-erp
DATABASE_URL="..." npx prisma migrate deploy

# 6. Smoke test.
npx prisma db execute --stdin <<< "SELECT 1;"
curl -s http://localhost:3000/api/health

# 7. Restart API.
systemctl start safari-erp-api
```

---

## 5. Drift guard

Schema drift (a change in `schema.prisma` with no matching migration)
silently poisons backup/restore because the restored DB will not match
the running app. CI runs:

```bash
npm run db:check-drift
```

before merge. The script exits with status `2` if drift is found and
instructs the developer to run `npx prisma migrate dev`.
