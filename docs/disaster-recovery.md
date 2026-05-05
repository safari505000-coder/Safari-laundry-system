# Disaster recovery

## PostgreSQL
- **Managed (RDS / Cloud SQL / Azure):** enable automated backups; PITR; retain ≥35 days for financial audit alignment.
- **Self-hosted:**
  - **Daily full:** `pg_dump "$DATABASE_URL" -Fc -f "full-$(date -u +%Y%m%d).dump"`
  - **Hourly incremental / WAL:** enable WAL archiving (`archive_mode=on`, `archive_command` to object storage).

## Redis (BullMQ state)
- Enable **AOF** (`appendonly yes`) and/or **RDB** snapshots; cross-AZ/cluster for HA.
- Example fragment: see `ops/redis/redis-persistence.example.conf`.

## Restore
```bash
chmod +x scripts/restore-db.sh
DATABASE_URL=postgres://... scripts/restore-db.sh ./backups/prod-YYYYMMDD.sql.gz
npx prisma migrate deploy
```

## Order
1. Stop traffic (scale deploy to 0 or drain LB).
2. Restore DB from latest consistent backup + WAL to target RPO.
3. Restore or rebuild Redis (queues may replay from DLQ; see runbooks).
4. Deploy API workers; verify `/health/ready` and golden-path payment in staging first.
