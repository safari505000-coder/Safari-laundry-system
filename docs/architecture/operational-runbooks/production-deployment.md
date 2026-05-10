# Runbook — Production deployment

> The standard deployment recipe. **Follow every step.** Skipping
> the pre-deploy checks is the leading cause of incidents that
> require a rollback.

## 1. Pre-deploy checklist (≤ 30 min before)

- [ ] **CI green.** Every job in CI passes on `main`. No
      "merge with failures".
- [ ] **V21 banking guards green.** Specifically:
      `npx jest src/finance/v21-canonical-banking-guards.spec.ts --runInBand`
- [ ] **Reconciliation green in staging.** Run a manual
      reconciliation in staging; confirm all four identities pass.
- [ ] **Migration review.** Read every Prisma migration in this
      release. Verify they are **additive-only** (CREATE TABLE,
      ADD COLUMN with NULLABLE default, CREATE INDEX). DESTRUCTIVE
      migrations (`DROP COLUMN`, `ALTER COLUMN … DROP NOT NULL`,
      `RENAME COLUMN`) require a **two-step deploy** (see §6).
- [ ] **Rollback compatibility.** Confirm the previous app version
      can run against the new schema. Spin up the previous Docker
      image against a fresh-migrated DB; hit `/health/ready`.
- [ ] **DO_NOT_TOUCH check.** Search the diff for any change inside
      a `DO_NOT_TOUCH` block. If found, stop — the diff needs the
      architect's sign-off.
- [ ] **Communicate.** Post the deploy time + change list in
      `#deploys` channel ≥ 30 min before.

## 2. Deploy window

- **Preferred window:** Sunday 02:00–04:00 KWT (low traffic).
- **Avoid:** Last 3 working days of the month (payroll cycle),
  Eid week, the day before any Friday in Ramadan.
- **Embargo:** No deploys during a live financial incident.

## 3. Deploy procedure

### 3.1 Migrations first (idempotent)

```bash
# Run migrations against production (idempotent — already-applied skip)
DATABASE_URL=$PROD_DATABASE_URL npx prisma migrate deploy
```

If migrations fail, **stop**. Investigate before deploying app.
A failed migration may have applied half — verify the schema with
`\dt` / `\d "TableName"` in psql.

### 3.2 App deploy

```bash
# Build + push image (CI typically does this; manual fallback)
docker build -t safari-erp:v3.5.0 .
docker push registry.example.com/safari-erp:v3.5.0

# Roll forward
kubectl -n production set image deploy/safari-erp \
  safari-erp=registry.example.com/safari-erp:v3.5.0

# Watch the rollout
kubectl -n production rollout status deploy/safari-erp --timeout=10m
```

Kubernetes uses `RollingUpdate` with `maxUnavailable=0` so the
service stays up while pods refresh.

### 3.3 Frontend deploy (if changed)

```bash
# Promote the new bundle to current/
aws s3 sync ./web/dist/ s3://safari-erp-web/current/ --delete --acl public-read
aws cloudfront create-invalidation --distribution-id ABCDE \
  --paths "/index.html" "/assets/*"
```

## 4. Post-deploy verification (≤ 10 min after)

- [ ] Health: `curl ${BASE}/health/ready` returns 200.
- [ ] Metrics: `process_uptime` resets to small value (rollout
      happened); `5xx` rate baseline.
- [ ] Reconciliation: run manual reconciliation, all four identities
      pass.
- [ ] Smoke test:
  - [ ] Login as a test user.
  - [ ] Open Customer 360 for a known customer; debt figure matches
        snapshot.
  - [ ] Open the cash-monitor; classifier traffic-light renders.
  - [ ] Submit a test POS order in the staging tenant on production
        infra (`X-Tenant: staging-canary` header) — order completes,
        journal entry appears.
- [ ] Watch logs for 10 min for any new error patterns:
      `kubectl -n production logs deploy/safari-erp --tail=500 -f | rg -i "error|warn"`.

## 5. Rollback signal

If any of the post-deploy verifications fail:

- **Stop new deploys.**
- Follow [`rollback-procedure.md`](./rollback-procedure.md).
- Communicate to `#deploys`.

## 6. Two-step destructive migration recipe

When a migration removes or renames something:

### Step A (release N)

- Add the new column / table.
- Backfill data via a forward-only migration script.
- Update code to write to BOTH old and new locations.
- Update reads to prefer NEW with fallback to OLD.

Deploy. Wait at least one week (full reconciliation cycle).

### Step B (release N+1)

- Remove the old column / table.
- Update code to write to NEW only.
- Run forward-only migration to drop the OLD.

Deploy. The interleaved approach means there is never a window
where production code does not have a column it expects.

## 7. Hot-fix deploy (urgent bug)

Hotfix deploys SKIP the staging soak but add an extra
post-deploy reconciliation:

```bash
# Hotfix: deploy + wait + verify reconciliation again
kubectl -n production set image deploy/safari-erp safari-erp=…
sleep 120
curl -sS -X POST "${BASE}/api/finance/reconciliation" -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

Hotfixes MUST NOT include a Prisma migration. If a migration is
required, do not hotfix — schedule a regular deploy.

## 8. Communication

| Audience | When | What |
| --- | --- | --- |
| `#deploys` | ≥ 30 min before | Deploy time + summary + rollback contact |
| `#deploys` | Start | "Deploying v3.5.0 now…" |
| `#deploys` | Success | "Deploy complete. All checks green." |
| `#deploys` | Issue | "Issue detected; rolling back. Update in 5 min." |
| Call-centre supervisor | Before any DESTRUCTIVE change | Heads-up of any UI change that affects scripts |
| Customer-facing | Only for breaking changes | Email/WhatsApp blast |

## 9. Related

- [`rollback-procedure.md`](./rollback-procedure.md) — the rollback recipe.
- [`reconciliation-drift.md`](./reconciliation-drift.md) — if the deploy left drift.
- [`../../safe-deployment.md`](../../safe-deployment.md) — the
  pre-existing safe-deployment guide.
- [`../../v20-7-final-validation.md`](../../v20-7-final-validation.md) — V20.7 final validation playbook.
