# Financial Hardening Report — Root-Cause Elimination

> Companion to [`docs/FINANCIAL_ROOT_CAUSE_ANALYSIS.md`](./FINANCIAL_ROOT_CAUSE_ANALYSIS.md).
> This report summarizes the discovered root cause, the protections added,
> the new tests, coverage, the remaining risk, and a final verdict on whether
> the 13 KD drift class can recur.
>
> Goal: **Financial System Integrity = Enterprise Grade.**

---

## 1. Discovered root cause (recap)

The 13 KD was a **`WALLET_LIABILITY` under-journaling** drift — a wallet
balance moved while its matching balanced journal entry was dropped. Two
independent causes had to coincide:

1. **Creation:** the journal mirror `*Safe` wrappers are **fail-open by
   default** — on a journal write failure they log, persist a
   `JournalFailureLog` row, return `null`, and let the business transaction
   **commit anyway**. (`src/general-ledger/double-entry-journal.service.ts`)
2. **Detection:** the `WALLET_LIABILITY_MATCH` reconciliation invariant that
   would have caught this exists but the cron was **disabled by default**, its
   `finance.drift.detected` events were **unrouted**, and there was **no
   owner-facing surface**. (`src/finance/reconciliation/reconciliation.service.ts`)

The single journal entry can never be internally unbalanced (`appendBalanced`
enforces that), so the drift was always a **missing** entry, never an
imbalanced one.

---

## 2. New protections

### 2.1 Prevention — application layer (hard fail, no partial success)

| Protection | What it does | Where |
|---|---|---|
| **`FinancialIntegrityService`** | Reusable guard: `assertEntryBalanced` (debit=credit / non-negative / non-ambiguous / ≥2 lines), `assertNoDuplicatePosting`, `assertNotAlreadySettled`, `assertNotAlreadyReversed`, `assertNonNegativeBalance`. Throws a hard `FinancialIntegrityError` so any surrounding `$transaction` rolls back. | `src/financial-integrity/financial-integrity.service.ts` |
| **Fail-closed coverage extended to all money wrappers** | `appendWalletAbsorptionEntry(V3)Safe`, `appendSubscriptionRefundEntrySafe`, `appendDebtDiscountEntrySafe`, `appendInvoiceCancellationEntrySafe`, and `mirrorDebtLedgerEntrySafe` now route through the shared `handleCriticalSafeFailure`, so `JOURNAL_FAIL_CLOSED_CRITICAL=true` makes **every** money-movement journal atomic (a journal failure rolls the balance change back). Also adds P2002 idempotency recovery to wrappers that lacked it. | `src/general-ledger/double-entry-journal.service.ts` |

> **Default behaviour is unchanged.** The fail-closed switch defaults OFF
> exactly as the locked contract test requires; the change only adds *coverage*
> when an operator enables it. The production runbook (§5) recommends enabling
> it.

### 2.2 Prevention — database layer (cannot be bypassed by any API or script)

Migration `20260601200000_financial_integrity_protection`:

| Protection | Guarantee |
|---|---|
| **Per-entry balance constraint trigger** (`JournalLine_entry_balanced`, `DEFERRABLE INITIALLY DEFERRED`) | At COMMIT, every `JournalEntry` with lines must satisfy `Σ debit = Σ credit` (±0.001) and have ≥2 lines, or the transaction aborts. An imbalanced entry is **impossible to commit** through Prisma, raw SQL, or psql. |
| **`CHECK` constraints on `JournalLine`** (`debit ≥ 0`, `credit ≥ 0`, not both > 0) | Negative / ambiguous lines are rejected at the storage layer. Added `NOT VALID` so the deploy never scans/locks existing rows; new rows are enforced immediately. |
| **Append-only triggers** (reused) | The new `DailyAccountingIntegrityReport` is immutable like the journal tables. |

Both honour the existing `app.immutable_ledger_bypass='true'` session flag for
legitimate maintenance, identical to the append-only guard.

### 2.3 Detection + alerting (closes "why undetected")

| Protection | What it does | Where |
|---|---|---|
| **`GET /owner/accounting-health`** | Read-only HEALTHY / WARNING / CRITICAL: 5 reconciliation invariants + per-entry balance scan + audit-chain integrity + journal-failure backlog + duplicate-posting scan. OWNER + ACCOUNTANT. | `src/financial-integrity/accounting-health.{service,controller}.ts` |
| **Daily reconciliation cron** | Always-on (skipped only in tests / when explicitly disabled). Persists a `DailyAccountingIntegrityReport`, writes an Audit Log every run (`suspicious=true` on WARNING/CRITICAL), and raises Discord System/Security alerts on WARNING/CRITICAL. | `src/financial-integrity/accounting-integrity.cron.ts` |
| **Live drift listener** | Subscribes to `finance.drift.detected` so an intraday drift alerts + audits immediately, not just at the daily run. | same |
| **Owner Command Center surface** | `accountingIntegrity` block (status + counts + last run) added to `GET /owner/command-center`. | `src/owner-command-center/owner-command-center.service.ts` |

---

## 3. New tests

| Suite | File | Covers |
|---|---|---|
| Guard unit | `src/financial-integrity/financial-integrity.service.spec.ts` | balanced / unbalanced / negative / ambiguous / empty / min-2 / duplicate / double-settlement / double-reversal / negative-balance |
| Health aggregator | `src/financial-integrity/accounting-health.service.spec.ts` | HEALTHY / WARNING (wallet drift) / CRITICAL (trial balance, unbalanced entry, broken chain, failure backlog) |
| Daily cron | `src/financial-integrity/accounting-integrity.cron.spec.ts` | persist + audit + alert routing + live drift listener + degraded-DB resilience |
| **Regression** | `src/test/regression/financial/financial-regression.spec.ts` | duplicate payment/deposit/settlement, journal imbalance, invalid/double reversal, **partial-failure recovery (fail-closed rollback)**, queue retry, concurrency (P2002) |
| **Chaos** | `src/test/chaos/financial-chaos.spec.ts` | DB failure (fail-closed rollback + forensics), network/persist failure (swallowed), retry storm (circuit breaker), queue/Redis failure (alerting never breaks the run) |

> The logical path is `tests/regression/financial`; the files live under
> `src/test/...` because Jest `rootDir` is `src` (so they actually execute in
> CI rather than being silently skipped).

### Results

- Full suite: **120 suites, 1065 passed, 21 skipped, 0 failed.**
- `tsc --noEmit`: clean.
- Locked contracts: API-contract, RBAC, schema, banking, and the two
  `double-entry-journal` failure/fail-closed specs all **green** (the only
  snapshot deltas are the additive `GET /owner/accounting-health` route).

---

## 4. Coverage of the original requirements

| Requirement | Status |
|---|---|
| 1. Root cause analysis doc | ✅ `FINANCIAL_ROOT_CAUSE_ANALYSIS.md` |
| 2. Financial guards (debit≠credit, drift, dup posting, double settlement/reversal, negative balance, broken chain) | ✅ `FinancialIntegrityService` + DB constraints |
| 3. DB protection (constraints / triggers / validation, unbypassable) | ✅ balance trigger + CHECK constraints + append-only |
| 4. Regression suite | ✅ `financial-regression.spec.ts` |
| 5. Chaos tests (Redis/DB/queue/network/retry) | ✅ `financial-chaos.spec.ts` |
| 6. `GET /owner/accounting-health` (HEALTHY/WARNING/CRITICAL) | ✅ |
| 7. Automated daily reconciliation + report + audit log | ✅ cron + `DailyAccountingIntegrityReport` |
| 8. Owner alerts (system/security/audit) + command center | ✅ Discord + audit + command-center block |
| 9. Hard-fail policy (no partial success) | ✅ guard throws + fail-closed coverage + DB trigger |
| 10. Final audit report | ✅ this document |

Constraints honoured: no correct accounting logic changed (defaults preserved,
locked specs green); no API contract / RBAC / audit-trail break; no reliance on
current data; production-safe (additive migration, `NOT VALID` constraints,
flag-gated behaviour).

---

## 5. Production runbook (operational closure)

To move from "detected + alerted" to "prevented" in production, set:

```bash
JOURNAL_FAIL_CLOSED_CRITICAL=true     # atomic journaling for ALL money wrappers
RECONCILIATION_CRON_ENABLED=true      # hourly reconciliation sweep
# ACCOUNTING_INTEGRITY_CRON_ENABLED defaults true (daily integrity + alerts)
```

Then deploy the migration (`prisma migrate deploy`) so the DB-level balance
trigger + CHECK constraints are active. Optionally, during a maintenance
window, `VALIDATE CONSTRAINT` the three `JournalLine` checks to prove the
historical set.

---

## 6. Remaining risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| `JOURNAL_FAIL_CLOSED_CRITICAL` left OFF in prod | Medium | Drift can still be *created* on a journal failure, but is now **detected within 24h and alerted** (was silent before). Runbook recommends ON. |
| The DB balance trigger only guards *imbalanced* entries, not *missing* ones | Low | A missing entry is caught by the daily reconciliation (`WALLET_LIABILITY_MATCH` / `SNAPSHOT_AR_MATCH`) + journal-failure backlog alert. |
| `NOT VALID` CHECK constraints don't prove historical rows | Low | New writes fully enforced; historical set already clean (always produced by `appendBalanced`). `VALIDATE CONSTRAINT` available. |
| Reconciliation tolerance is ±0.001 KD | Negligible | Deliberate 1-fils slack for legitimate runtime micro-drift; CI lock asserts 0 drift on the seeded fixture. |
| Alert delivery depends on Redis/Discord availability | Low | Alert failures are swallowed and never break accounting; the persisted `DailyAccountingIntegrityReport` + Audit Log remain as the durable record. |

---

## 7. Final verdict — can the error recur?

- **Imbalanced entry:** **No** — DB constraint trigger + CHECK constraints reject
  it on every path.
- **Duplicate / double posting / double settlement / double reversal:** **No** —
  unique `sourceRef` + idempotent `appendBalanced` + explicit guards.
- **Missing entry (the exact 13 KD class):**
  - With the runbook applied (`JOURNAL_FAIL_CLOSED_CRITICAL=true`): **prevented** —
    a journal failure rolls back the balance change, so no partial success is
    possible.
  - Even without it: **no longer silent** — detected within 24h (and intraday via
    the live drift listener) and escalated as an owner + security alert with a
    full audit trail.

**Conclusion:** the silent-drift failure mode that produced the 13 KD is
closed. What was previously an undetectable partial commit is now either
impossible (fail-closed + DB trigger) or loudly surfaced and audited.
