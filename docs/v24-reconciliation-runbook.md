# V24 — Reconciliation Engine Runbook (Operator Guide)

> Single source of truth for: what the engine checks, what each
> drift means, how to triage it in production, and how to confirm
> the fix.
>
> Audience: on-call accountants, finance engineers, the V24
> Financial Authority custodians.

---

## 1. The Engine at a Glance

| Item | Value |
|---|---|
| Service | `src/finance/reconciliation/reconciliation.service.ts` |
| HTTP endpoint | `GET /api/finance/reconciliation/run` (OWNER / ACCOUNTANT / GM / CC_SUPERVISOR) |
| Cron | hourly, env-gated by `RECONCILIATION_CRON_ENABLED=true` |
| Tolerance band (production) | `0.001 KD` (3dp) |
| Tolerance band (CI lock-in) | `0.0000 KD` (exact) |
| Drift signal | `finance.drift.detected` event + `[FINANCIAL_DRIFT]` warn log |
| Lock-in test | `src/finance/reconciliation/v24-reconciliation-baseline.spec.ts` |

---

## 2. The Five Invariants

| # | Invariant | Compares | Lives In |
|---|---|---|---|
| 1 | `TRIAL_BALANCE` | Σ `JournalLine.debit` vs Σ `JournalLine.credit` (global) | `checkTrialBalance()` |
| 2 | `ASSETS_EQ_LIAB_PLUS_EQUITY` | Σ Assets vs Σ Liabilities + Σ (Equity + Revenue − Expense) | `checkBalanceSheetIdentity()` |
| 3 | `WALLET_LIABILITY_MATCH` | Σ Journal AC `2100` (credit-normal net) vs Σ `CustomerWallet.balance` | `checkWalletLiabilityMatch()` |
| 4 | `AR_INTEGRITY` | Σ Journal AC `1300` (debit-normal net) vs legacy Σ `Order.totalPrice WHERE cashStatus=UNPAID` | `checkArIntegrity()` |
| 5 | `SNAPSHOT_AR_MATCH` (V24) | Σ Journal AC `1300` (debit-normal net) vs Σ `FinancialSnapshot.remainingDebtKd` | `checkSnapshotArMatch()` |

---

## 3. Drift Triage Tree

```
Drift detected →
  ├── invariant=TRIAL_BALANCE
  │     ├── Cause: appendBalanced bypassed by raw insert.
  │     ├── Action: BLOCK ALL FINANCE WRITES. Investigate latest commits to
  │     │   `general-ledger/double-entry-journal.service.ts`. Trial-balance
  │     │   drift means EVERY downstream invariant is unreliable.
  │     └── SQL: SELECT id, ts, sourceModule FROM "JournalEntry"
  │              ORDER BY ts DESC LIMIT 50;
  │
  ├── invariant=ASSETS_EQ_LIAB_PLUS_EQUITY
  │     ├── Cause: missing AccountType for an account, or a journal entry
  │     │   that posts to an account whose `type` field is null.
  │     ├── Action: Confirm every account has a `type` enum value.
  │     │   Check the `detail` field — it lists assets/liab/equity totals
  │     │   so the imbalance is visible.
  │     └── SQL: SELECT a.code, a.type, SUM(jl.debit-jl.credit) FROM
  │              "JournalLine" jl JOIN "Account" a ON a.id=jl.accountId
  │              GROUP BY a.code, a.type ORDER BY a.code;
  │
  ├── invariant=WALLET_LIABILITY_MATCH
  │     ├── Cause: a wallet write skipped the journal (V20.3.4
  │     │   subscription-cancel bug pattern), OR a journal write skipped
  │     │   the wallet table.
  │     ├── Action: Compare wallet entry timestamps vs journal entry ts
  │     │   for the affected customer. The drift sign tells you which
  │     │   side is short — POSITIVE delta = wallet has more than journal.
  │     └── SQL: SELECT cw.customerId, cw.balance,
  │              (SELECT SUM(jl.credit-jl.debit) FROM "JournalLine" jl
  │               JOIN "Account" a ON a.id=jl.accountId
  │               WHERE a.code='2100' AND jl.entryId IN (
  │                 SELECT id FROM "JournalEntry"
  │                 WHERE sourceModule='CustomerWallet'
  │                   AND sourceId=cw.id::text)) AS journal_total
  │              FROM "CustomerWallet" cw;
  │
  ├── invariant=AR_INTEGRITY
  │     ├── Cause: This invariant uses the LEGACY view
  │     │   (Σ Order.totalPrice WHERE cashStatus=UNPAID) which is NOT
  │     │   partial-payment-aware. Drift here often reflects benign
  │     │   partial-payment activity, NOT a real ledger problem.
  │     ├── Action: First, check if SNAPSHOT_AR_MATCH (invariant 5) is
  │     │   ALSO drifting. If invariant 5 is OK and only invariant 4 is
  │     │   drifting, the cause is partial-payment slippage — the journal
  │     │   AR is correct, the legacy view is just looking at gross totals.
  │     ├── If both 4 AND 5 are drifting → real journal-AR drift,
  │     │   escalate to the snapshot procedure below.
  │     └── SQL: SELECT id, customerId, totalPrice, cashStatus FROM "Order"
  │              WHERE cashStatus='UNPAID' AND status != 'CANCELED'
  │              ORDER BY createdAt DESC LIMIT 200;
  │
  └── invariant=SNAPSHOT_AR_MATCH (V24)
        ├── Cause priority order:
        │     1. (most common) The 5-minute FinancialSnapshot cron has
        │        not yet refreshed a stale row. Wait one cron cycle and
        │        re-run the reconciliation.
        │     2. A debt-mutating commit failed to fire its post-commit
        │        `refreshOneInBackground` hook (event-bus regression).
        │        Check `[FINANCIAL_SNAPSHOT_FAILURE]` warn logs from the
        │        same time window.
        │     3. The projector itself has a bug — extremely rare, blocked
        │        by `financial-snapshot.spec.ts` in CI.
        │     4. A customer was hard-deleted but their journal lines
        │        remain (orphan AR debits). Find via SQL below.
        ├── Detail field carries `snapshotCount=N`. Compare to total
        │   customer count — a large gap (e.g. snapshotCount=1500 vs
        │   `Customer.count()=1700`) means many customers have no
        │   snapshot row yet → trigger `rebuildAll`.
        ├── Action 1 (no-op fix): Wait one cron cycle (5 min) and re-run.
        ├── Action 2 (force rebuild): Run scripts/rebuild-financial-snapshots.ts
        │   for the suspect customer set, OR call rebuildAll() via an admin
        │   shell.
        └── SQL (orphan AR — drift cause #4):
              SELECT a.code, jl.debit, jl.credit, je.sourceId, je.ts
              FROM "JournalLine" jl
              JOIN "Account" a ON a.id=jl.accountId
              JOIN "JournalEntry" je ON je.id=jl.entryId
              WHERE a.code='1300'
                AND je.sourceId NOT IN (SELECT id::text FROM "Customer")
              ORDER BY je.ts DESC LIMIT 100;
```

---

## 4. Tolerance Rationale (Why 0.001 in Production)

The runtime band is set to `0.001 KD` (3dp) deliberately:

- All amounts are stored at 4dp, so 0.001 absorbs the LEGITIMATE sources
  of micro-drift that occur even on a healthy system:
  - Open partial-payment row mid-write — the writer commits in two journal
    lines plus one snapshot refresh, so a polling reconciliation can
    observe a transient 1-fils mismatch.
  - Customer wallet rounding when an FX-equivalent helper materialises a
    0.0001 KD epsilon difference.
  - Decimal aggregation rounding over 100k+ rows.

- Anything ABOVE 0.001 KD is treated as real drift and emits a
  `finance.drift.detected` event.

- The `v24-reconciliation-baseline.spec.ts` lock-in test asserts a
  STRICTER 0.0000 KD drift on the seeded fixture — CI sees a clean
  ledger and must report a clean ledger. **Do NOT relax the CI tolerance
  to "fix" a failing baseline spec.** Find the real bug.

---

## 5. Production Health Checks

| Check | Frequency | Where |
|---|---|---|
| Cron is enabled | Verify on every release | `process.env.RECONCILIATION_CRON_ENABLED === 'true'` |
| Cron is firing | Check daily | `[V20_4_RECONCILIATION] generatedAt=...` log line should appear hourly |
| Drift count is 0 | Check daily | Same log line — `driftCount=0 ok=true` is healthy |
| Endpoint responds | Smoke-test on every deploy | `curl -H "Authorization: Bearer $JWT" $BASE/api/finance/reconciliation/run` should return JSON with `ok: true` |
| Lock-in spec passes | Every CI run | `npx jest src/finance/reconciliation` |

---

## 6. Escalation

A real (non-transient) drift event of any flavour must be:

1. Acknowledged in the operator's Slack channel within 30 minutes.
2. Triaged using §3 above within 2 hours.
3. Either (a) fixed by a code/data correction, or (b) catalogued as a
   known-benign with a documented rationale appended to this runbook.

NEVER silently widen `TOLERANCE_KD` to suppress an alert. Every relaxation
of the tolerance is a trade against the V24 Frozen Core Policy and
requires explicit architectural review.

---

**End of V24 Reconciliation Runbook.**
