# Runbook — Period-lock enforcement (`PERIOD_LOCK_ENFORCE`)

> The period-lock guard (V20.5 Phase 5) refuses journal writes
> dated inside a CLOSED accounting period, but the guard is **opt-in**
> via env flag. This runbook covers enabling it safely in production.

## 1. What `PERIOD_LOCK_ENFORCE` does

When `PERIOD_LOCK_ENFORCE=true` AND `FinancialPeriodsService` is
wired:

- Every call to `DoubleEntryJournalService.appendBalanced` runs
  `PeriodLockGuard.assertWriteAllowed(date)` first.
- If the date falls in a CLOSED period:
  - The write **throws** `PERIOD_LOCKED`.
  - A `FinancialPeriodViolation` row is recorded with the actor id
    and `sourceRef`.
  - The transaction rolls back.
- The only path past a CLOSED period is `reverseEntry` with
  `allowReversal=true` (admin-authorised).

When `PERIOD_LOCK_ENFORCE` is unset / false:

- The guard runs in **monitor mode**: it logs a warning but does
  not throw.
- The financial write proceeds normally.

## 2. Why this is opt-in

Closing a period is an accounting decision (typically end-of-month).
Until the operator opts in:

- The period lifecycle (`OPEN → SOFT_CLOSED → CLOSED → ARCHIVED`)
  exists but `assertWriteAllowed` is a no-op.
- Operators may run the system without strict month-end discipline.

For **regulatory-grade** operation, the lock must be enforced.
This runbook is how you turn it on without breaking ongoing flows.

## 3. Pre-flight

Run for **one full month-end cycle** in monitor mode first:

- Confirm `[FINANCIAL_PERIOD_VIOLATION]` log lines are sparse
  (≤ 5 per day). High volume means there are still legitimate
  writes targeting closed periods that need separate handling.
- Read every `FinancialPeriodViolation` row from the last 30 days:

  ```sql
  SELECT id, "actorUserId", "sourceRef", "attemptedAt", "periodId", reason
  FROM "FinancialPeriodViolation"
  ORDER BY "attemptedAt" DESC LIMIT 100;
  ```

- For each violation, classify:
  - **Legitimate (e.g. backdated correction)** — needs a reversal,
    not a direct write. Train the team.
  - **Bug (e.g. cron writing in the wrong period)** — fix the bug
    before enforcement.

Only proceed to enforcement when violations are zero (or all are
known reversals).

## 4. Enforcement procedure

### 4.1 Communicate (one week before)

Post to `#announcements`:

> Effective <date>, period-lock enforcement (`PERIOD_LOCK_ENFORCE=true`)
> will be enabled in production. After this date:
>
> - Journal writes targeting CLOSED periods will be REFUSED.
> - Backdated corrections must use the reversal API.
> - Operators must close periods on time (end of month).
>
> Please review your monthly close checklist.

### 4.2 Enable the flag

```bash
kubectl -n production set env deploy/safari-erp PERIOD_LOCK_ENFORCE=true
kubectl -n production rollout restart deploy/safari-erp
```

### 4.3 Verify

```bash
# Confirm the flag took effect
kubectl -n production exec deploy/safari-erp -- env | rg PERIOD_LOCK_ENFORCE

# Run a synthetic test (in staging-canary tenant) — write a journal entry
# dated in a closed period. Should throw PERIOD_LOCKED.

# Confirm a real write to the current OPEN period still succeeds.
```

### 4.4 Monitor

For the first week after enablement, watch:

- `period_lock_violation_total` counter (should remain near zero).
- New `FinancialPeriodViolation` rows (any new ones are
  unintentional — investigate each one).
- Customer-facing alerts (no spike in payment failures).

If violations spike, **revert** by setting
`PERIOD_LOCK_ENFORCE=false` and investigate the root cause.

## 5. Closing a period (the process)

To close a period (e.g. month-end May 2026):

### 5.1 Reconcile

Run reconciliation; confirm all four identities pass for the period.

### 5.2 Soft-close

```bash
curl -sS -X POST "${BASE}/api/finance/periods/<periodId>/soft-close" \
  -H "Authorization: Bearer ${ACCOUNTANT_TOKEN}"
```

Soft-close = period is closed for new writes but reversals are
still allowed. This buys 24–72 hours for accountants to spot
discrepancies.

### 5.3 Hard-close

```bash
curl -sS -X POST "${BASE}/api/finance/periods/<periodId>/close" \
  -H "Authorization: Bearer ${ACCOUNTANT_TOKEN}"
```

Hard-close = period is closed; reversals require explicit
`allowReversal=true` opt-in (admin-authorised).

### 5.4 Archive

After ~90 days of stable hard-close, archive:

```bash
curl -sS -X POST "${BASE}/api/finance/periods/<periodId>/archive" \
  -H "Authorization: Bearer ${ARCHITECT_TOKEN}"
```

Archived periods are read-only forever; no reversal is possible.
Archive only when the period is fully audited and signed off.

## 6. Reversing a CLOSED period entry

If a closed-period entry must be corrected:

```ts
// Authorised admin only
await journal.reverseEntry(
  'PAYMENT:abc123',
  'manual reversal — incident #1234',
  { allowReversal: true },
);
```

This writes a reversal entry **dated today** (in the current OPEN
period), with a `sourceRef = PAYMENT:abc123:REVERSAL`. The
original entry stays untouched.

## 7. Disabling enforcement (rollback)

If enforcement causes operational problems:

```bash
kubectl -n production set env deploy/safari-erp PERIOD_LOCK_ENFORCE=false
kubectl -n production rollout restart deploy/safari-erp
```

The guard reverts to monitor mode. Any in-flight blocked writes
will succeed on retry. The `FinancialPeriodViolation` rows from
the enforcement window remain (append-only).

## 8. V21 Phase 4 — Period-integrity health monitor

V21 ships a pure read-only projection helper at
`src/finance/periods/period-lock-monitor.ts` that converts the
combination of `FinancialPeriod` + `FinancialPeriodViolation` rows
into a structured health snapshot suitable for:

- Operator dashboards (`green | amber | red` tile).
- Prometheus exposition (`recentRejectedViolations`,
  `recentReversalViolations` counters).
- Alerting (`amber` over a sustained window → page accountant).

Wire it from a controller / cron with:

```ts
const periods = await periodsService.list();
const violations = await periodsService.listViolations({ limit: 200 });
const health = projectPeriodHealth({
  enforcementMode: process.env.PERIOD_LOCK_ENFORCE === 'true' ? 'enforcing' : 'monitoring',
  periods,
  violations,
});
metrics.gauge('period_lock_recent_rejected', health.recentRejectedViolations);
metrics.gauge('period_lock_recent_reversal', health.recentReversalViolations);
if (health.health === 'red') alerter.page(health.reason);
```

The function is unit-tested at
`src/finance/periods/period-lock-monitor.spec.ts` (6 cases).

### Health classification matrix

| Mode | Rejected | Reversal | Result |
| --- | --- | --- | --- |
| `enforcing` | 0 | 0 | **green** — clean |
| `enforcing` | 1..4 | any | **green** — within tolerance |
| `enforcing` | 5..19 | any | **amber** — investigate writer |
| `enforcing` | ≥ 20 | any | **red** — immediate page |
| `monitoring` | 0 | 0 | **green** — quiet |
| `monitoring` | ≥ 1 | any | **amber** — operators are still trying to write into closed periods; fix before flipping to `enforcing` |

Default thresholds are 5 (amber) / 20 (red) per snapshot window.
Pass a custom `thresholds` argument for per-tenant tuning.

## 9. Related

- [`../invariants.md`](../invariants.md) — invariant 14 (modifications via reversal only).
- [`../financial-core.md`](../financial-core.md) §3 (reversal-only corrections).
- [`reconciliation-drift.md`](./reconciliation-drift.md).
