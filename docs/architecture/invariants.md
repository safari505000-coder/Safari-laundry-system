# Safari ERP — Financial Invariants

> The non-negotiable safety rules that hold across the entire system.
> Every invariant here is enforced **somewhere** in code (the
> "Enforcement" column tells you where). If a future change appears
> to require violating one of these, **stop and re-read this
> document**.
>
> An invariant is "non-negotiable" because violating it produces
> outcomes that cannot be detected without forensic auditing —
> which is to say, outcomes that would let money quietly disappear.
>
> Companion documents:
>
> - [`financial-core.md`](./financial-core.md) — what the canonical core is.
> - [`payment-flows.md`](./payment-flows.md) — how each flow upholds these.
> - [`module-ownership.md`](./module-ownership.md) — who owns the enforcement.

---

## 1. The 20 invariants

| # | Invariant | Status | Enforcement |
| --- | --- | --- | --- |
| 1 | Σ Debit == Σ Credit (per entry) | ENFORCED | `DoubleEntryJournalService.appendBalanced` validates Σ DR == Σ CR within ±0.001 KWD before INSERT. Imbalance throws `JOURNAL_NOT_BALANCED`. |
| 2 | Σ Debit == Σ Credit (org-wide) | ENFORCED | `ReconciliationService.checkTrialBalance` runs on every reconciliation (hourly + nightly). Drift logged + alerted. |
| 3 | Assets == Liabilities + Equity | ENFORCED | `ReconciliationService.checkBalanceSheetIdentity` runs on every reconciliation. |
| 4 | debt == AR | ENFORCED | `ReconciliationService.checkArIntegrity` cross-checks `Σ DebtLedgerEntry.remaining` vs `Σ AR balance from journal`. |
| 5 | No negative AR | ENFORCED | AR derived from journal lines only (V20.4 master flag). Each line is a `Prisma.Decimal`; negative is impossible without a contra-credit. |
| 6 | No phantom receivables | ENFORCED | AR derived from journal only (V20.4 master flag). `wallet.debt` is a derived projection, never the source. |
| 7 | No orphan wallet entries | ENFORCED | `ReconciliationService.checkWalletLiabilityMatch` confirms every absorption maps to an invoice. |
| 8 | No UI drift | ENFORCED | 96 V21 guard cases (`src/finance/v21-canonical-banking-guards.spec.ts`) lock 41 frontend surfaces — block every forbidden pattern (parseFloat on KD, local formatters, reduce aggregations) at build time. |
| 9 | No duplicate `sourceRef`s | ENFORCED | UNIQUE indexes on `JournalEntry.sourceRef`, `FraudAlert`, `PromiseToPay`, `FinancialPeriod`. |
| 10 | No mutable financial history | ENFORCED | DB-level append-only triggers on 9+ tables (see §2). |
| 11 | No journal bypass writers | ENFORCED | `guardJournalDelegate` Prisma extension intercepts `prisma.journalEntry.create` outside `JournalSourceService`. |
| 12 | Idempotent financial ops | ENFORCED | Deterministic `sourceRef`s + `findUnique` short-circuit + P2002 retry guards (catch unique violations as no-ops). |
| 13 | Atomic financial writes | ENFORCED | Every transition uses `prisma.$transaction`. No partial-write state is reachable. |
| 14 | Modifications via reversal only | ENFORCED | Period-lock `allowReversal` opt-in is the only path past CLOSED periods. Reversals carry `:REVERSAL` suffix on `sourceRef`. |
| 15 | Wallet writes serialised per-customer | ENFORCED | `lockCustomerWalletForUpdateTx` (`SELECT … FOR UPDATE`) on every wallet update path. |
| 16 | Decimal precision (4dp internal, 3dp display) | ENFORCED | `toMinorFromFixed4` + canonical `web/src/lib/kwd.ts`. No `parseFloat` / `Number()` in execution paths. |
| 17 | Gateway amount validation | ENFORCED | `validateFinalizeGatewayMetadata` rejects amount mismatch. `forceCapturedFinalize` bypass fires Discord alert. |
| 18 | Cash classifier rules immutable | ENFORCED | Cursor rule (`.cursor/rules/cash-intelligence-safety.md`) + 5 KD floor / 24h gate / compliance-never-topRisk hard-coded. |
| 19 | Snapshot envelopes hash-verifiable | ENFORCED | Phase 3 `canonicalHash` + `verifyCanonicalSnapshot` (deterministic SHA-256, key-order independent). |
| 20 | Replay equality (replay output == stored output) | ENFORCED | Phase 3 `replayStatementSnapshot` + golden tests assert pure-function reproducibility. |

---

## 2. Append-only tables (the immutable family)

These tables have **PostgreSQL triggers** that block UPDATE,
DELETE, and TRUNCATE at the database level. Even a malicious
SQL injection cannot mutate history on these tables:

| Table | Trigger function | What's protected |
| --- | --- | --- |
| `JournalEntry` | `journal_entry_append_only_guard` | Every journal entry, sourceRef, lines |
| `JournalLine` | `journal_line_append_only_guard` | Every debit / credit line |
| `DebtLedgerEntry` | `debt_ledger_entry_append_only_guard` | Every debt-affecting event |
| `CollectionsStageEvent` | `collections_stage_event_append_only_guard` | Every collections lifecycle transition |
| `PromiseEvent` | `promise_event_append_only_guard` | Every promise-to-pay event |
| `FraudAlert` (detection-time fields) | `fraud_alert_detection_immutable_guard` | `type`, `customerId`, `payload`, `fingerprint`, `detectedAt`, `actorId` |
| `FinancialPeriodViolation` | `financial_period_violation_append_only_guard` | Every period-lock breach |
| `FinancialEventOutbox` | `financial_event_outbox_append_only_guard` | Every event in the outbox |
| `FinancialEventDelivery` | `financial_event_delivery_append_only_guard` | Every delivery attempt |

Mutable allowed updates exist on other models (e.g.
`FraudAlert.status` for resolution workflow, `CustomerWallet.balance`
for projections), but every immutable table above is
**INSERT-only at the database**.

---

## 3. The "no UI math" invariant in detail

This is the invariant that V21 Phases 4 and 5 hardened most
aggressively. The guard suite (`src/finance/v21-canonical-banking-guards.spec.ts`)
encodes 96 test cases across 41 frontend surfaces. The forbidden
patterns are:

| Pattern | Why it's forbidden | Allowed alternative |
| --- | --- | --- |
| `parseFloat(amountKd)` | JS float arithmetic loses fils precision | Backend computes the value; frontend renders it as a string. |
| `Number(amountKd)` | Same | Same |
| `unary +amountKd` | Same | Same |
| `amountKd.toFixed(N)` on the client | Re-formatting drifts from canonical 3dp | Use `formatKwdAmount` / `formatKwdLabel` from `web/src/lib/kwd.ts`. |
| Local `KWD_SUFFIX` constant | Duplicates the canonical formatter | Import from `web/src/lib/kwd.ts`. |
| Local `function formatKwd*(…)` definition | Duplicates the canonical formatter | Same |
| `array.reduce((sum, …) => sum + parseFloat(amountKd), 0)` | Frontend aggregation drift | Backend computes the total; expose as `totalKd: string`. |
| `Math.max(-balance, 0)` | Frontend financial derivation | Backend exposes the derived field. |
| Re-implementing `formatArabicKwd` | Duplicates the canonical formatter | Use `formatKwdLabel` from `web/src/lib/kwd.ts`. |

The guard runs on every CI build. Any frontend file that
re-introduces a forbidden pattern fails the build. New surfaces
that need to display money must opt into the guard by listing
themselves in `guardedFiles`, `readonlyProjectionGuardedFiles`, and
`singleFormatterGuardedFiles`.

### Sole exceptions (allow-listed)

| File | Reason |
| --- | --- |
| `web/src/lib/sales-debt-analytics.ts` | Local gross-vs-collected analytics; documented file pragma; not financial truth derivation. |
| `web/src/lib/sales-debt-insights.ts` | Same. |
| `web/src/lib/knet-statement-parse.ts` | Bank statement parser; read-only file decoder; no writes. |

These three files **must not grow** without re-evaluating the
allow-list. New analytics that need cross-flow numbers must
compute on the backend.

---

## 4. The "single canonical writer" invariant

`DoubleEntryJournalService.appendBalanced` is the sole writer of
`JournalEntry` / `JournalLine`. Direct `prisma.journalEntry.create`
calls anywhere else are intercepted by:

```ts
// src/prisma/guards/guard-journal-delegate.ts
prisma.$extends({
  query: {
    journalEntry: {
      create: ({ args, query }) => {
        if (!isInternalJournalServiceCall()) {
          throw new Error('DIRECT_JOURNAL_WRITE_FORBIDDEN');
        }
        return query(args);
      },
    },
  },
});
```

The check is via async-local-storage flag set by
`JournalSourceService.appendBalanced` only. Any other caller
short-circuits with the error at runtime. **The error name is
fatal in production** — it means a bypass attempt occurred.

---

## 5. The "deterministic sourceRef" invariant

Every monetary event must have a `sourceRef` that:

1. Encodes the **business event id**, not the gateway id (so
   gateway lies cannot trick us).
2. Is **stable across retries** (so duplicate webhooks become
   no-ops).
3. Is **unique** in `JournalEntry.sourceRef` (so the database
   itself enforces single-write semantics).

The naming convention is in [`financial-core.md` §4](./financial-core.md#4-sourceref-idempotency).

When a new payment kind or correction kind is introduced, you
**must**:

- Pick a new prefix (e.g. `REFUND:PARTIAL:`).
- Document it in `financial-core.md` §4.
- Add it to the `sourceRef` cheat-sheet in `payment-flows.md` §11.
- Add a unit test asserting that the same business event computed
  twice yields the same `sourceRef`.

---

## 6. The "row-level wallet lock" invariant

Every wallet update path acquires `SELECT … FOR UPDATE` on the
wallet row before reading its balance. The implementation lives at
`src/customer-ledger/customer-ledger.service.ts`:

```ts
async function lockCustomerWalletForUpdateTx(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<CustomerWalletRow> {
  const rows = await tx.$queryRawUnsafe<CustomerWalletRow[]>(
    'SELECT * FROM "CustomerWallet" WHERE "customerId" = $1 FOR UPDATE',
    customerId,
  );
  return rows[0] ?? createWalletForCustomerTx(tx, customerId);
}
```

**Why it matters:** Without the lock, two concurrent settlements for
the same customer can both read `wallet.balance = 100`, both compute
"absorb 60", both write `wallet.balance = 40`. The customer is
charged 60 once but the wallet records the absorption only once.

**Caveat:** The lock is a Postgres-only feature. On test mocks or
non-Postgres engines, the call silently no-ops. **Production must
be Postgres** or this invariant breaks. There is no automated
detection for this assumption today — it is documented here as a
permanent guard.

---

## 7. The "atomic transaction" invariant

Every multi-step financial write is wrapped in
`prisma.$transaction`. This is enforced by code review and
documented at every call site. The pattern is:

```ts
await this.prisma.$transaction(
  async (tx) => {
    // Step 1: lock wallet
    await lockCustomerWalletForUpdateTx(tx, customerId);
    // Step 2: update wallet
    await tx.customerWallet.update(…);
    // Step 3: append journal
    await this.journal.appendBalanced(tx, …);
    // Step 4: append debt ledger
    await tx.debtLedgerEntry.create(…);
  },
  { maxWait: 5_000, timeout: 30_000 },
);
```

If any step throws, the entire transaction rolls back atomically.
There is no half-settled state.

`maxWait` and `timeout` are tuned to prevent runaway transactions
holding wallet locks indefinitely.

---

## 8. The "decimal precision" invariant

| Layer | Representation | Reason |
| --- | --- | --- |
| Database | `Prisma.Decimal` (`Decimal(18,4)`) | Exact 4dp precision; no rounding error |
| Backend in-memory math | Integer minor units (4dp) via `toMinorFromFixed4` | Fast integer math; deterministic |
| API response | `string` (e.g. `"123.4567"`) | JSON-safe; no float coercion |
| Frontend display | `string` rendered via `formatKwdAmount` / `formatKwdLabel` | 3dp suffix `د.ك`; no math |

Forbidden in execution paths:

- `parseFloat(s)`
- `Number(s)`
- `+s`
- JS arithmetic on monetary numbers

The only place a backend `parseFloat` is tolerated is for
**threshold compares** (e.g. `if (debtKd > 500) flag()`) in
`customer-evaluator.ts` and `financial-alerts.service.ts`.
These are not settlement math; they are categorical classification.
A future Phase 10 will route these through `Prisma.Decimal` compare
to eliminate the residual.

---

## 9. The "period-lock" invariant

`PeriodLockGuard.assertWriteAllowed(date)` runs before every journal
write. If the date falls in a CLOSED accounting period:

- The write **throws** `PERIOD_LOCKED`.
- A `FinancialPeriodViolation` row is recorded (append-only) with
  the attempted `sourceRef` and actor id.
- The transaction rolls back.

`reverseEntry` is the only path past a CLOSED period — and only
when `allowReversal=true` is explicitly opt-in by an authorised
actor.

**Operational caveat:** `PERIOD_LOCK_ENFORCE` is an opt-in env
flag. In production the operator must explicitly enable it.
Until enabled, period-lock violations are LOGGED but not
ENFORCED. See [`operational-runbooks/period-lock-enforcement.md`](./operational-runbooks/period-lock-enforcement.md).

---

## 10. The "rebuild guarantee" invariant

Every materialised projection (`FinancialSnapshot`,
`FinancialKpiSnapshot`, read models) must be rebuildable from the
canonical journal alone. This is verified by:

```ts
// FinancialSnapshotService.rebuildAll()
//   1. await prisma.financialSnapshot.deleteMany({});
//   2. for each customer: refreshOne(customerId);
//   3. assert Σ remainingDebtKd == reconciliation AR
```

The rebuild is part of the Phase 3 contract test suite. Any
projection that cannot be reproduced from the journal is a
**dangerous projection** and must be removed.

---

## 11. The "snapshot hash equality" invariant

Phase 3 introduced `canonicalHash(envelope)` — a deterministic
SHA-256 of the canonical snapshot envelope. The hash is:

- Independent of object key order (canonical JSON serialisation).
- Stable across decimal-string formatting (`Decimal.toString()`).
- Stable across event ordering (`createdAt` then `id` lexicographic).

Tests verify that:

- The same financial state computed twice produces the same hash.
- Mutating any monetary value changes the hash.
- Mutating any `sourceRef` changes the hash.
- Mutating any `createdAt` (non-monotonic) changes the hash.

The hash is the **integrity stamp** for archived snapshots. If a
PDF is re-rendered six months later from an archived snapshot, the
hash on the rendered output equals the hash on the archive — proof
of integrity.

---

## 12. The "replay equality" invariant

Phase 3 introduced `replayStatementSnapshot(events)` — a pure
function that takes an event list and produces a statement
snapshot. The invariant:

```
replayStatementSnapshot(events) == storedSnapshot(customerId, asOf)
```

Holds for any (customer, asOf) pair. Verified by:

- Golden contract tests (`src/finance/canonical-replay.spec.ts`)
  with fixed event lists and fixed expected outputs.
- Reconciliation-time spot checks (sample customers compared
  replay vs stored).

If replay drifts from stored, the system has a bug — drift on this
invariant is **always** a bug, never a tolerance.

---

## 13. The "frontend display-only" invariant

The frontend is allowed to:

- Render values it received from the backend.
- Maintain UI state (filters, sorting, selection).
- Compose POS carts (with backend re-validation).
- Format display via `web/src/lib/kwd.ts`.

The frontend is **never** allowed to:

- Compute a balance.
- Aggregate a total.
- Derive a debt figure.
- Reconstruct a statement.
- Compute a KPI.
- Compute a running balance.
- Re-implement formatting.

This is enforced by the V21 guard suite (96 test cases).
See [`payment-flows.md`](./payment-flows.md) for the per-flow rationale.

---

## 14. Where to extend this document

Add a new invariant when:

- A new financial table is introduced — document its enforcement.
- A new external boundary is added (e.g. a new payment gateway) —
  document its trust boundary.
- A new reconciliation identity is added — document its check.
- A new immutable rule is enforced (UI guard, DB trigger, code
  invariant) — document it here.

Do **not** weaken an existing invariant without a written change
proposal that:

1. States the proposed weakening explicitly.
2. Documents the migration path (how existing data is handled).
3. Lists the forensic risk (what becomes invisible).
4. Has owner + reviewer sign-off recorded in
   [`../v21-engineering-governance.md`](../v21-engineering-governance.md).
