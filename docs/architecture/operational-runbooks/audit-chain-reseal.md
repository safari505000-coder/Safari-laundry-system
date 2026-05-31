# Audit Chain Re-Seal Runbook

Status: prepared only. Do not apply without the gate checklist below.

This runbook repairs the historical `audit_chain_corruption` caused by benign
race/fork behavior in `public.audit_logs`. It must run only after the deployed
application serializes future audit appends.

## Gate Checklist

All gates are mandatory before `--apply`:

- PR #20 audit append serialization is deployed and `/api/health` is healthy.
- Production diagnosis confirms benign race/fork behavior, not tampering.
- `public.audit_logs` has a verified backup.
- Owner explicitly approves the re-seal window.

## 1. Backup `public.audit_logs`

Use Railway export if available, or run `pg_dump` with the public Railway TCP
proxy URL. The table name is the physical Prisma mapping: `public.audit_logs`.

PowerShell example:

```powershell
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$out = "$env:USERPROFILE\Desktop\audit_logs_backup_$ts.dump"
pg_dump.exe `
  --dbname="$env:DATABASE_URL" `
  --table=public.audit_logs `
  --format=custom `
  --file="$out"
pg_restore.exe --list "$out" | Select-String "audit_logs"
```

Also verify the row count against production before applying:

```sql
SELECT COUNT(*) AS audit_log_rows FROM public.audit_logs;
```

## 2. Dry Run

```powershell
node scripts/audit-chain-reseal.cjs
```

Expected production signs:

- `rows` is near the latest `AuditIntegrityCron.checked` value.
- `firstBreakAt` matches the production alert, for example
  `23aa08ef-012c-4165-8e0b-9b09551c25cd`.
- `rowsToRewrite` is reported before any write occurs.

## 3. Apply

Only after backup verification and explicit approval:

```powershell
$env:RESEAL_CONFIRM = "I_HAVE_A_BACKUP"
node scripts/audit-chain-reseal.cjs --apply
```

The script applies in one transaction and takes the same advisory lock as
`AuditLogsService` before updating rows. It only updates `prevHash` and `hash`
on `audit_logs`; it does not touch orders, payments, cash, users, or ledger rows.

## 4. Verify

Run a read-only chain verification query:

```sql
WITH ordered AS (
  SELECT
    id,
    "prevHash",
    hash,
    LAG(hash) OVER (ORDER BY "createdAt" ASC, id ASC) AS expected_prev
  FROM public.audit_logs
)
SELECT COUNT(*) AS broken_rows
FROM ordered
WHERE "prevHash" IS DISTINCT FROM COALESCE(expected_prev, 'GENESIS');
```

Expected: `broken_rows = 0`.

Then watch the next `AuditIntegrityCron` run. It should stop reporting
`audit_chain_corruption`.
