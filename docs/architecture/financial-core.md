# Safari ERP — Financial Core Architecture

> Single source of truth for *how* money moves through Safari ERP.
> This document is **prescriptive**: every financial change must conform to
> what is described here, or the change must update this document **first**.
>
> Companion documents:
>
> - [`payment-flows.md`](./payment-flows.md) — step-by-step trace of every
>   payment kind (CASH, KNET handheld, KNET gateway, mixed, wallet,
>   debt settlement, refund/reversal, collections).
> - [`invariants.md`](./invariants.md) — the enforced safety rules
>   (Σ debit = Σ credit, append-only, reversal-only corrections, etc.).
> - [`module-ownership.md`](./module-ownership.md) — who owns which
>   module and what may import what.
> - [`event-map.md`](./event-map.md) — every domain event, producer,
>   consumer, payload, idempotency strategy.
> - [`V20.4_ARCHITECTURE.md`](./V20.4_ARCHITECTURE.md) — the historical
>   ADR that introduced the snapshot + read-model layer this document
>   builds on.
> - [`../v21-full-financial-execution-audit.md`](../v21-full-financial-execution-audit.md)
>   — the live execution audit that this document distils into rules.

---

## 1. The canonical ledger

Safari ERP runs on a **double-entry, append-only** general ledger.
The single canonical writer is:

```
src/general-ledger/double-entry-journal.service.ts
  → DoubleEntryJournalService.appendBalanced(db, input)
```

Every monetary movement in the system MUST go through this method.
There are no exceptions. Direct `prisma.journalEntry.create()` from
anywhere else in the codebase is a critical violation.

The two tables this writes to are:

| Table | Purpose | Mutation profile |
| --- | --- | --- |
| `JournalEntry` | One entry per logical financial event. Carries `customerId`, `branchId`, `sourceRef`, `description`. | INSERT only (DB trigger blocks UPDATE / DELETE / TRUNCATE). |
| `JournalLine` | The N debit + M credit lines for that entry. | INSERT only (DB trigger blocks UPDATE / DELETE / TRUNCATE). |

`JournalEntry.sourceRef` is a **deterministic, unique string** that
encodes which business event the entry represents (for example
`INVOICE:<orderId>:SHORTFALL`, `PAYMENT:<paymentId>`,
`HANDOVER:<custodyId>`, `WALLET_TOPUP:<paymentId>`).
The unique index on `sourceRef` is what gives us idempotency: a retry
finds the same row and `appendBalanced` short-circuits.

### What `appendBalanced` actually does

1. **Idempotency check** — `findUnique({ where: { sourceRef } })`.
   If the entry already exists, return it unchanged.
2. **Period-lock guard** — `PeriodLockGuard.assertWriteAllowed(date)`.
   If the entry's date falls in a CLOSED accounting period, throw and
   record a `FinancialPeriodViolation` row.
3. **Balance validation** — Σ `debit` MUST equal Σ `credit` to within
   ±0.001 KWD. Imbalance throws `JOURNAL_NOT_BALANCED` and refuses to
   write.
4. **Atomic write** — `JournalEntry.create({ data: { …, lines: { create: lines } } })`
   inside the caller's transaction.
5. **Append-only DB trigger** — even if a developer or DBA bypassed
   the application layer, the DB trigger
   `journal_entry_append_only_guard` raises an exception on UPDATE,
   DELETE, or TRUNCATE. The same applies to `JournalLine`.

### Why this matters

The journal is the **source of truth for everything**:

- AR (accounts receivable) is the sum of debits to AR accounts minus
  credits — derived live, never stored.
- The `customer_debt` figure shown on Customer 360 is derived from
  the journal via `DebtVisibilityService` and the materialised
  `FinancialSnapshot.remainingDebtKd`. Both numbers reduce to the
  same journal scan.
- Every report (executive, monthly, branch, money flow, daily cash
  closing, KNET audit) is a **read** over the journal — never a
  separate accounting layer.

If the journal is right, the system is right. If the journal is
wrong, the system is irrecoverable. That is why every other rule in
this document exists.

---

## 2. Append-only strategy

The append-only invariant is enforced at **three layers**:

| Layer | Mechanism | What it blocks |
| --- | --- | --- |
| Application | `DoubleEntryJournalService.appendBalanced` is the sole writer. | Accidental direct Prisma calls. |
| ORM | The Prisma model for `JournalEntry` / `JournalLine` has no `update` method exposed from the service. | Direct `prisma.journalEntry.update()` from a different service. |
| Database | PostgreSQL trigger `journal_entry_append_only_guard` raises on UPDATE / DELETE / TRUNCATE. | Manual SQL, broken migrations, malicious code. |

The same three-layer enforcement applies to:

- `DebtLedgerEntry` (append-only debt history)
- `CollectionsStageEvent` (append-only collections lifecycle)
- `PromiseEvent` (append-only promise-to-pay state machine)
- `FraudAlert` (detection-time fields)
- `FinancialPeriodViolation` (audit log of period-lock violations)
- `FinancialEventOutbox` / `FinancialEventDelivery` (event sourcing
  outbox for snapshot refresh)

### Why we never UPDATE financial rows

Auditors do not trust mutable history. Bank examiners do not trust
mutable history. A single `UPDATE` in the wrong place can rewrite
last-quarter revenue and there is no way to know it happened.

Append-only solves this with no ambiguity: the row that recorded
the truth at the moment of the truth is *exactly* the row you read
six months later.

---

## 3. Reversal-only corrections

When something needs to "change" — a payment was misclassified, a
debt was overstated, an invoice was voided — Safari ERP **never
edits the original row**. Instead, it writes a **reversing entry**:

```
Original entry  (sourceRef = INVOICE:42:SHORTFALL)
   DR  AR            10.000
   CR  WalletLiab    10.000

Reversing entry (sourceRef = INVOICE:42:SHORTFALL:REVERSAL)
   DR  WalletLiab    10.000
   CR  AR            10.000

Replacement entry (sourceRef = INVOICE:42:SHORTFALL:V2)
   DR  AR             5.000
   CR  WalletLiab     5.000
```

Net effect: AR = +10 -10 +5 = +5. History intact. Reversal
traceable. Auditor happy.

The reversal pattern is implemented by:

- `DoubleEntryJournalService.reverseEntry(originalSourceRef, reason)`
  — writes a balanced reversal whose `sourceRef` is the original
  with `:REVERSAL` suffix.
- `customer-ledger.service.ts` — the only callers that may invoke
  reversals (admin correction, refund, void).

A reversal is itself idempotent: calling
`reverseEntry('INVOICE:42:SHORTFALL', …)` twice writes the reversing
entry once, because `INVOICE:42:SHORTFALL:REVERSAL` is unique.

---

## 4. `sourceRef` idempotency

`sourceRef` is the **single most important field** in the entire
system. It is the deduplication key.

### Naming convention

`<DOMAIN>:<id>[:variant]`

| Prefix | Meaning | Example |
| --- | --- | --- |
| `INVOICE:<orderId>:SHORTFALL` | The shortfall journal entry written when an order completes (debit AR, credit WalletLiab). | `INVOICE:1234:SHORTFALL` |
| `INVOICE:<orderId>:SHORTFALL:REVERSAL` | Reversal of the above. | `INVOICE:1234:SHORTFALL:REVERSAL` |
| `PAYMENT:<paymentId>` | The journal entry for an external payment capture. | `PAYMENT:pay_abc` |
| `HANDOVER:<custodyId>` | Driver→Manager cash handover. | `HANDOVER:cust_555` |
| `DEPOSIT:<depositId>` | Manager→Bank deposit. | `DEPOSIT:dep_77` |
| `WALLET_TOPUP:<paymentId>` | Customer wallet recharge. | `WALLET_TOPUP:pay_xyz` |
| `WALLET_ABSORB:<orderId>:<seq>` | Wallet auto-absorption against a debt invoice. | `WALLET_ABSORB:1234:1` |
| `DEBT_TRANSFER:<transferId>` | Driver→Driver debt transfer. | `DEBT_TRANSFER:dt_99` |
| `DEBT_HOLD:<holdId>` | Debt held against an employee. | `DEBT_HOLD:dh_12` |
| `EXPENSE:<expenseId>` | Operational expense. | `EXPENSE:exp_7` |
| `PAYROLL:<payrollId>` | Payroll disbursement. | `PAYROLL:pr_3` |

### Why determinism matters

If a callback arrives twice (e.g. UPayments retries the webhook),
both calls compute the same `sourceRef`. The first creates the row.
The second hits the unique index, `appendBalanced` returns the
existing entry, and **no double-posting occurs**.

If the gateway lies about which `track_id` it captured, our
`sourceRef = PAYMENT:<paymentId>` is anchored to *our* payment row,
not the gateway's id, so we cannot be tricked into writing a second
entry by a corrupted upstream.

---

## 5. Reconciliation pipeline

Reconciliation is the **periodic proof** that the journal still
agrees with itself. It does NOT mutate the journal — it reads it.

```
src/finance/reconciliation/reconciliation.service.ts
```

The pipeline runs five separate identities:

| # | Identity | What it proves |
| --- | --- | --- |
| 1 | Σ debit == Σ credit (per-entry and global) | The journal is balanced. |
| 2 | Assets == Liabilities + Equity | The balance sheet identity holds. |
| 3 | Σ AR (journal) == Σ DebtLedgerEntry.remaining | The debt projection has not drifted. |
| 4 | Σ WalletLiability (journal) == Σ CustomerWallet.balance | The wallet projection has not drifted. |
| 5 | No orphan wallet entries (every absorption maps to an invoice). | Settlement integrity. |

Failures are recorded as `[RECONCILIATION_DRIFT]` log lines plus a
counter increment (`reconciliation_drift_total`) and a Discord alert
when the threshold is crossed. **Drift is treated as a P1 incident**
— see [`operational-runbooks/reconciliation-drift.md`](./operational-runbooks/reconciliation-drift.md).

The reconciler runs:

- **On-demand** via `/api/finance/reconciliation` (admin only).
- **Hourly** via cron (`reconciliation.cron.ts`) over the last 24h
  window.
- **Nightly** full-history scan (operator-tunable via env).

---

## 6. Wallet settlement

When an order is completed, the wallet must absorb whatever portion
the customer paid up-front, and any remainder becomes debt. The
single canonical orchestrator is:

```
src/customer-ledger/customer-ledger.service.ts
  → applyOrderWalletSettlementForCompletedOrder(tx, orderId, performerId, …)
```

The orchestrator runs **inside a `prisma.$transaction`** with these
steps in this order:

1. **`lockCustomerWalletForUpdateTx(tx, customerId)`** — acquires a
   `SELECT … FOR UPDATE` lock on the wallet row. Prevents concurrent
   settlements from racing.
2. **Decimal math via `toMinorFromFixed4`** — every monetary value is
   converted to integer minor units (4dp) before any arithmetic.
   `parseFloat` and JS `Number` arithmetic are forbidden in the
   settlement path.
3. **`CustomerWallet.update`** — wallet balance debited by the
   amount absorbed. Driven by row-level lock; no read-then-write
   races.
4. **`TransactionHistory.create`** — append-only audit row recording
   the wallet movement.
5. **`DebtLedgerEntry.create`** — if there is a shortfall, a debt
   row is created with `sourceRef = INVOICE:<orderId>:SHORTFALL`.
   On `P2002` (unique constraint), the operation is treated as
   already done (idempotent) — the existing row is returned.
6. **`DoubleEntryJournalService.appendInvoiceIssuanceEntrySafe`** OR
   **`mirrorDebtLedgerEntrySafe`** — writes the balanced journal
   entry through the canonical writer.
7. **`GeneralLedgerService.append`** — legacy single-entry GL mirror
   write. Kept for backward-compat reports; not the source of truth.

If any step throws, the entire `$transaction` rolls back and the
wallet row is unchanged. The customer's bank balance is never left
in an inconsistent state.

### Why locking matters

Without a row-level lock, two concurrent order completions for the
same customer can both read `wallet.balance = 100`, both compute
"absorb 60", both write `wallet.balance = 40` — and the customer is
charged 60 once but the wallet records the absorption only once.
The lock makes this impossible: the second transaction blocks until
the first commits, then re-reads the post-update balance.

---

## 7. Subscription absorption

Subscriptions are pre-paid plans that consume wallet credit on a
schedule (daily, weekly, monthly, yearly). The canonical absorber
is:

```
src/customer-ledger/customer-ledger.service.ts
  → runPrepaidAutoReconcileForCustomer(tx, customerId, …)
```

This method runs after every settlement and looks for outstanding
debt rows that the customer's wallet can now absorb (because a
top-up just landed, or because the subscription period rolled
over).

Absorption rules:

- The wallet absorbs debt **FIFO by createdAt**. Oldest invoice
  wins.
- Each absorption writes a journal entry with
  `sourceRef = WALLET_ABSORB:<orderId>:<seq>` where `seq` increments
  per partial-absorption against the same invoice.
- Subscription expiry is recorded as `CustomerSubscription.status`
  transition (ACTIVE → EXPIRED), with the timestamp captured for
  audit but **no monetary side-effect** (the unconsumed portion
  remains in the wallet).

Subscription state lives in `CustomerSubscription`. The model is
event-sourced via `subscription.activated` / `subscription.expired`
domain events — see [`event-map.md`](./event-map.md).

---

## 8. Debt lifecycle

Debt is **derived from the journal**, but for performance and audit
visibility it is materialised in two places:

| Table | Purpose | Mutation profile |
| --- | --- | --- |
| `DebtLedgerEntry` | Append-only ledger of every debt-affecting event. `sourceRef` matches the journal entry. | INSERT only (DB trigger). |
| `FinancialSnapshot` | Materialised per-customer aggregates (`remainingDebtKd`, `overdueInvoicesCount`, `lastPaymentAt`, `refreshedAt`). Rebuildable from the journal at any time. | UPDATE allowed (it's a projection); the projector is `FinancialSnapshotService.refreshOne`. |

Lifecycle states (derived, not stored as separate columns):

```
ISSUED  →  PARTIAL  →  COLLECTED
   │         │
   │         └→  WRITTEN_OFF  (after exhausted collections lifecycle)
   │
   └→  VOIDED  (reversed before any payment)
```

Each transition is an append to `DebtLedgerEntry` with the matching
`appendBalanced` call. There is no UPDATE on `DebtLedgerEntry` —
"this debt is now collected" is encoded as a new row that nets the
balance to zero.

`FinancialSnapshot` is **rebuildable**: dropping the table and
running `FinancialSnapshotService.rebuildAll()` produces identical
numbers — that is the rebuild guarantee that makes it trustworthy.

---

## 9. Payment lifecycle

A payment moves through:

```
INTENT  →  IN_PROGRESS  →  CAPTURED  →  SETTLED
                  │
                  └→  FAILED  →  (no journal write)
                  │
                  └→  REFUNDED  (reversal entry)
```

Where each transition writes (or reverses) a journal entry:

| Transition | Journal write | `sourceRef` |
| --- | --- | --- |
| INTENT → IN_PROGRESS | none | none |
| IN_PROGRESS → CAPTURED | DR Cash/KNET, CR AR (or WalletLiab if topup) | `PAYMENT:<paymentId>` |
| CAPTURED → SETTLED | none (settlement runs separately, see §6) | — |
| CAPTURED → REFUNDED | DR AR, CR Cash/KNET (reversal) | `PAYMENT:<paymentId>:REVERSAL` |
| → FAILED | none — failure is a status, not a financial event | — |

The detailed step-by-step trace for each kind of payment is in
[`payment-flows.md`](./payment-flows.md).

### Gateway verification (KNET)

For external gateway payments (UPayments KNET), the system **never
trusts the client-side return URL** to mark a payment as captured.
Instead, `PaymentsService.finalizePaidOrderFromGateway` runs:

1. Look up the payment row by `posGatewayTrackId`.
2. Server-side call to UPayments inquiry API with the same
   `track_id`.
3. Confirm the gateway reports CAPTURED.
4. Only then call `appendBalanced` with `sourceRef = PAYMENT:<id>`.

A spoofed return URL cannot trigger a journal write. A duplicate
webhook hits the unique `sourceRef` and short-circuits.

---

## 10. The single-truth diagram

```
                        ┌─────────────────────────────────┐
                        │   Frontend (render-only)        │
                        │   web/src/lib/kwd.ts (only fmt) │
                        └───────────────┬─────────────────┘
                                        │ HTTP
                                        ▼
                        ┌─────────────────────────────────┐
                        │   78 controllers (HTTP boundary)│
                        └───────────────┬─────────────────┘
                                        │
                ┌───────────────────────┴──────────────────────┐
                │                                              │
                ▼                                              ▼
      ┌──────────────────┐                          ┌──────────────────┐
      │ OrdersService    │                          │ PaymentsService  │
      │ (state machine)  │                          │ (gateway verify) │
      └────────┬─────────┘                          └────────┬─────────┘
               │                                             │
               └──────────────┬──────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ CustomerLedgerService        │
                │ apply…SettlementForCompleted │
                │ (orchestrator, $transaction) │
                └──────────┬───────────────────┘
                           │
                           ▼
                ┌──────────────────────────────┐
                │ DoubleEntryJournalService    │
                │ appendBalanced (sole writer) │
                └──────────┬───────────────────┘
                           │
                           ▼
       ┌────────────────────────────────────────────────────┐
       │  PostgreSQL — JournalEntry + JournalLine           │
       │  (append-only triggers; UPDATE/DELETE blocked)     │
       └────────────────────────────────────────────────────┘
                           │
                           │ (event outbox)
                           ▼
       ┌────────────────────────────────────────────────────┐
       │  Snapshot refresher (event-driven + 5-min cron)    │
       │  → FinancialSnapshot, FinancialKpiSnapshot         │
       │  → Read models (collections, subscribers, KPI…)    │
       └────────────────────────────────────────────────────┘
                           │
                           ▼
                  Read-only API surfaces
                  (DebtVisibility, KPI, Timeline, Reports)
```

Read this diagram top-to-bottom. Money only flows in this direction.
Anything else is a violation.

---

## 11. What this document forbids

If you find yourself wanting to do any of the following, **stop and
re-read this document**:

- Direct `prisma.journalEntry.create()` outside `appendBalanced`.
- Direct `prisma.journalEntry.update()` anywhere.
- Direct `prisma.debtLedgerEntry.update()` or `…delete()` anywhere.
- `parseFloat(amount)` on any monetary string in a settlement,
  payment, or journal write path.
- Computing a balance, total, or KPI on the frontend.
- Adding a "second canonical source" of debt or AR.
- Mutating `walletBalance` outside `customer-ledger.service.ts`.
- Bypassing `appendBalanced` for "performance" reasons.

Every one of these is a deletable change. The journal is the
truth; everything else is a derived view.

---

## 12. Where to extend this document

Update this file when:

- A new `sourceRef` prefix is introduced — add it to §4.
- A new financial table joins the append-only family — add it to §2.
- A new reconciliation identity is added — add it to §5.
- A new payment kind is supported — add the lifecycle in §9 and the
  detailed trace in [`payment-flows.md`](./payment-flows.md).

Do not update this file for UI changes, formatting changes, or read
optimisations. Those belong in module-level READMEs.
