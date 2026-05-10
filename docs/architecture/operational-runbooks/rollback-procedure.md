# Runbook — Rollback procedure

> When a deployment goes bad and you need to revert. Banking-grade
> rules apply: rollback must be **financial-safe** — the previous
> version must be able to read every journal entry the new version
> wrote.

## 1. When to rollback

| Situation | Action |
| --- | --- |
| New deploy has critical bug (5xx > 1% sustained) | Rollback **app** layer immediately. |
| New deploy introduced reconciliation drift | Rollback **app** layer, then run [`reconciliation-drift.md`](./reconciliation-drift.md). |
| New deploy includes a Prisma migration | **DO NOT rollback the migration.** Rollback the app, leave the migration. |
| New deploy broke the frontend only (API healthy) | Rollback the **frontend** asset bundle only. |
| New deploy broke a single role (e.g. Driver) | Consider a hotfix instead of a full rollback. |

## 2. Rollback rules — the non-negotiables

1. **Never rollback a Prisma migration.** Migrations are forward-only.
   The code rollback must be **forward-compatible** with whatever
   schema the new migration left behind.
2. **Never alter financial rows during rollback.** No
   `UPDATE "JournalEntry"`, no
   `DELETE FROM "DebtLedgerEntry"`. Append-only triggers will
   refuse anyway.
3. **Test rollback compatibility before deploying.** Every
   migration PR must include a "previous version still works
   against new schema" smoke test (typically: spin up old image
   against fresh-migrated DB; verify health).
4. **Communicate to the call-centre** before rollback —
   in-flight POS sessions may briefly fail; collections agents
   should pause.

## 3. App rollback (Kubernetes)

```bash
# Identify the previous good image
kubectl -n production rollout history deploy/safari-erp

# Rollback to the previous revision
kubectl -n production rollout undo deploy/safari-erp

# Watch the rollout
kubectl -n production rollout status deploy/safari-erp
```

Or roll to a specific revision:

```bash
kubectl -n production rollout undo deploy/safari-erp --to-revision=42
```

Verify health after rollback:

```bash
curl -sS "${BASE}/health/ready" | jq .
curl -sS "${BASE}/metrics" | rg "process_uptime"
```

## 4. Frontend rollback (CDN-hosted asset bundle)

If the frontend is served from a CDN (S3 + CloudFront / similar):

```bash
# Re-promote the previous bundle to the live path
aws s3 sync s3://safari-erp-builds/v3.4.2/ s3://safari-erp-web/current/ \
  --delete --acl public-read

# Invalidate CloudFront so users get the rollback within seconds
aws cloudfront create-invalidation --distribution-id ABCDE \
  --paths "/index.html" "/assets/*"
```

The frontend has no DB writes; rollback is safe regardless of
in-flight users (their next page load gets the previous bundle).

## 5. After-rollback checklist

1. Confirm health endpoint returns 200.
2. Confirm 5xx rate is back to baseline.
3. Confirm `payments_finalize_failure_total` is not climbing.
4. Run on-demand reconciliation:

   ```bash
   curl -sS -X POST "${BASE}/api/finance/reconciliation" \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .
   ```

5. Spot-check 5 recent orders (inspect `walletSettledAt`,
   `JournalEntry`).
6. Spot-check the cash-monitor dashboard — classifier numbers
   match cash custody totals.

## 6. If the rollback itself fails

If `kubectl rollout undo` fails or the previous image is also bad:

1. **Freeze writes** (see [`reconciliation-drift.md`](./reconciliation-drift.md) §3.1).
2. Page the architect on-call.
3. Assess: was the bad change in the schema, the bus, or the writer?
4. If schema: a Prisma migration may need a follow-up
   forward-only fix. **NEVER manually `DROP COLUMN` financial
   columns**; create a follow-up migration that adds back any
   removed-but-still-needed column.
5. Document the recovery path and execute it under architect
   supervision.

## 7. Migration rollback policy (forward-only)

Every Prisma migration in this repo is **forward-only**. We do not
write `down()` migrations. The reasons:

- Reverting a migration on a live DB is a leading cause of data
  loss in incidents.
- A "bad migration" should be fixed by a NEW migration that
  forwards-corrects the schema.
- The append-only DB triggers physically prevent destructive
  rollbacks of financial tables.

If a migration was the cause of an incident:

1. Rollback the **app** to the previous revision (safe — see
   §3 + §2.3).
2. Author a forward-fix migration on a feature branch.
3. Test the forward-fix against a snapshot of production schema
   in staging.
4. Deploy app + new migration together in the next deploy window.

## 8. Related

- [`production-deployment.md`](./production-deployment.md) — the
  pre-deploy checklist that prevents most rollbacks.
- [`reconciliation-drift.md`](./reconciliation-drift.md) — if the
  bad deploy left financial drift.
- [`../invariants.md`](../invariants.md) — the invariants the
  rollback must preserve.
- [`../../safe-deployment.md`](../../safe-deployment.md) — the
  pre-existing safe-deployment guide (older version of this).
