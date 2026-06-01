# Backup Verification Report

> This file is **generated/overwritten** by `scripts/verify-backup.ts` on each run.
> The content below is the initial template until the first verification runs.

- **Generated:** _not yet run_
- **Backup file:** _n/a_
- **Size:** _n/a_
- **Backup created:** _n/a_
- **Overall result:** _PENDING_

## Steps

| Step | Status | Detail |
| ---- | ------ | ------ |
| Locate latest backup | ⏳ PENDING | Run `npx tsx scripts/verify-backup.ts` |
| Backup freshness | ⏳ PENDING | Expect age <= 25h for daily cadence |
| Archive integrity (pg_restore --list) | ⏳ PENDING | Requires Docker |
| Restore into temporary database | ⏳ PENDING | Ephemeral `postgres:18-alpine` container |
| Core table sanity counts | ⏳ PENDING | `User`, `Order`, `JournalEntry`, `JournalLine`, `audit_logs` |

## How to run

```bash
# 1. Take a fresh backup (writes *.dump to Desktop)
npx tsx scripts/backup-db-to-desktop.ts

# 2. Verify it (restores into a throwaway Docker Postgres and counts rows)
npx tsx scripts/verify-backup.ts
# or point at a specific file / directory:
npx tsx scripts/verify-backup.ts --file "C:\\Users\\me\\Desktop\\safari-erp-backup-....dump"
BACKUP_DIR=/backups npx tsx scripts/verify-backup.ts
```

The script exits non-zero on any failed step so it can gate a scheduled job / CI.
