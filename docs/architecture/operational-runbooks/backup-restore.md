# Runbook — Backup & restore

> Postgres backups, PITR, and the restore drill. **Practise this
> quarterly** even when nothing is wrong — the only reliable way
> to know your backups work is to restore from them on a schedule.

## 1. Backup strategy (current)

| Layer | Mechanism | Retention | Recovery objective |
| --- | --- | --- | --- |
| Postgres logical backups | `pg_dump` nightly via cron, uploaded to S3 | 30 days | RTO 1h, RPO 24h |
| Postgres WAL archiving (PITR) | Continuous WAL ship to S3 | 14 days | RTO 1h, RPO 5 min |
| Redis | `BGSAVE` every 6 h; AOF on | 7 days | RTO 30 min, RPO 6h (or AOF latest write if AOF intact) |
| App config (Kubernetes secrets, env) | Git-versioned via sealed-secrets / SOPS | Forever | RTO 5 min |
| Filesystem (uploaded slips, etc.) | S3 with versioning + lifecycle | 365 days | RTO 5 min |

The pre-existing high-level guide is in
[`../../disaster-recovery.md`](../../disaster-recovery.md). This
runbook is the **operational playbook** for actually running a
restore.

## 2. When to restore

| Situation | Restore strategy |
| --- | --- |
| Single accidental table truncate | PITR to a moment before the truncate; selective restore |
| Whole DB corrupted (rare on managed Postgres) | Restore from latest snapshot + replay WAL to current |
| Region-wide outage (cloud provider) | Failover to standby region (multi-region setup — see [`../../multi-region.md`](../../multi-region.md)) |
| Lost data older than 30 days | Cannot recover — escalate to legal/audit |

## 3. Restore drill (quarterly)

### 3.1 Goals

- Confirm backups are restorable.
- Confirm RTO/RPO targets are met.
- Train the on-call engineer in the restore commands.

### 3.2 Procedure

```bash
# Step 1: Spin up a fresh Postgres in the staging region
psql -h staging-restore.db -U postgres -c "CREATE DATABASE restore_drill;"

# Step 2: Download the latest logical backup from S3
aws s3 cp s3://safari-erp-backups/postgres/latest.sql.gz ./

# Step 3: Restore
gunzip < latest.sql.gz | psql -h staging-restore.db -U postgres -d restore_drill

# Step 4: Verify schema + row counts
psql -h staging-restore.db -d restore_drill -c "
  SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;
"

# Step 5: Run reconciliation against the restored snapshot
DATABASE_URL='postgres://postgres@staging-restore.db/restore_drill' \
  npm run reconciliation:check

# Step 6: Verify all four reconciliation identities pass
# (trial balance, balance sheet, AR integrity, wallet liability)

# Step 7: Drop the restore drill DB
psql -h staging-restore.db -U postgres -c "DROP DATABASE restore_drill;"
```

Document the outcome in the drill log.

## 4. Production restore (from logical backup)

> **Only the architect** authorises a production restore. Restoring
> overwrites recent data — RPO 24h means you may lose up to 24 hours
> of writes.

```bash
# Step 1: Take a current snapshot first (for forensics — never overwrite without one)
pg_dump -h prod.db -U postgres -Fc safari_erp > /backups/pre-restore-$(date +%Y%m%d-%H%M).dump

# Step 2: Stop the app (drain traffic, then scale to 0)
kubectl -n production scale deploy/safari-erp --replicas=0

# Step 3: Restore the chosen backup
psql -h prod.db -U postgres -c "DROP DATABASE safari_erp;"
psql -h prod.db -U postgres -c "CREATE DATABASE safari_erp;"
gunzip < /backups/<backup>.sql.gz | psql -h prod.db -U postgres -d safari_erp

# Step 4: Run prisma migrate to bring schema to current
DATABASE_URL=$PROD_DATABASE_URL npx prisma migrate deploy

# Step 5: Start the app
kubectl -n production scale deploy/safari-erp --replicas=3

# Step 6: Verify reconciliation BEFORE accepting writes
# (set READ_ONLY_FINANCIAL=true while you verify)
kubectl -n production set env deploy/safari-erp READ_ONLY_FINANCIAL=true
kubectl -n production rollout restart deploy/safari-erp
curl -sS -X POST "${BASE}/api/finance/reconciliation" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .

# Step 7: If reconciliation passes, lift the freeze
kubectl -n production set env deploy/safari-erp READ_ONLY_FINANCIAL-
kubectl -n production rollout restart deploy/safari-erp
```

## 5. Production restore (PITR — point-in-time)

For surgical restores (e.g. recover from an accidental truncate at
14:32:15):

```bash
# Use the cloud-provider's PITR UI (RDS, Cloud SQL, AlloyDB, etc.)
# Restore to a NEW database instance at the target timestamp.

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier safari-erp-prod \
  --target-db-instance-identifier safari-erp-restore-2026-05-08-1432 \
  --restore-time 2026-05-08T14:32:00Z

# Once the new instance is up, dump the affected tables:
pg_dump -h safari-erp-restore-2026-05-08-1432.db -U postgres \
  --table='public."JournalEntry"' \
  --table='public."JournalLine"' \
  --table='public."DebtLedgerEntry"' \
  safari_erp > /backups/affected-tables.sql

# Selectively re-insert into production via a forward-fix script.
# NEVER directly UPDATE/DELETE existing financial rows on prod.
# Instead, append reversal entries that net to the desired state.
```

## 6. Redis restore

```bash
# Stop workers (they will reconnect once Redis is back)
kubectl -n production scale deploy/safari-erp-workers --replicas=0

# Restore RDB snapshot
aws s3 cp s3://safari-erp-backups/redis/latest.rdb /var/lib/redis/dump.rdb
chown redis:redis /var/lib/redis/dump.rdb

# Restart Redis
systemctl restart redis

# Restart workers
kubectl -n production scale deploy/safari-erp-workers --replicas=N
```

If AOF is intact, prefer AOF over RDB (RPO is much better — typically
< 1 second of writes lost).

## 7. Verifying a restore

After every restore (drill OR production):

- [ ] All Prisma migrations applied.
- [ ] All four reconciliation identities pass.
- [ ] Spot-check 5 known customers — Customer 360 numbers match
      the audit's expected values for that period.
- [ ] Spot-check the journal — `SELECT COUNT(*) FROM "JournalEntry"`
      matches the expected count for the restored window.
- [ ] Trial balance Σ DR == Σ CR.
- [ ] Health endpoint returns 200.

## 8. What you must never do

- ❌ Restore directly into the live DB without first taking a
  snapshot of the current state. Forensics may need it later.
- ❌ Modify financial rows during a restore. **All corrections via
  reversal entries**, even if the restore is partial.
- ❌ Skip reconciliation after a restore. The four identities must
  pass before you accept writes.
- ❌ Disable the append-only triggers during a restore "to make it
  easier". The triggers are why your data is trustworthy in the
  first place.
- ❌ Restore from a backup older than the retention policy claims —
  the WAL archive may not cover the window.

## 9. Drill schedule

| Quarter | What | Owner |
| --- | --- | --- |
| Q1 | Logical backup restore drill (§3) | On-call engineer |
| Q2 | PITR drill (§5) | Architect + on-call |
| Q3 | Region failover drill | Architect + Ops |
| Q4 | Full DR drill (everything) | Whole team |

Document each drill outcome in the drill log. Update this runbook
with anything that didn't work as documented.

## 10. Related

- [`../../disaster-recovery.md`](../../disaster-recovery.md) — high-level DR strategy.
- [`../../multi-region.md`](../../multi-region.md) — multi-region DR.
- [`incident-response.md`](./incident-response.md) — the IR ceremony.
- [`reconciliation-drift.md`](./reconciliation-drift.md) — verifying integrity post-restore.
