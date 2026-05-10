# Safari ERP — Payment Flows

> Step-by-step trace of every payment kind in Safari ERP, from the
> UI button the user presses to the journal row that lands in
> Postgres.
>
> Each flow lists: **entrypoint, services touched, transactions,
> journal writes, sourceRefs, invariants enforced**.
>
> Companion documents:
>
> - [`financial-core.md`](./financial-core.md) — what the canonical ledger is.
> - [`invariants.md`](./invariants.md) — the safety rules every flow must obey.
> - [`event-map.md`](./event-map.md) — the domain events each flow emits.

---

## Index

| Flow | Kind | Section |
| --- | --- | --- |
| A | Cash | §1 |
| B | KNET handheld (in-person) | §2 |
| C | KNET online (gateway / hosted page) | §3 |
| D | Mixed payment | §4 |
| E | Wallet / Subscription consumption | §5 |
| F | Debt settlement (gateway link / CC manual) | §6 |
| G | Refund / Reversal (Invoice VOID) | §7 |
| H | Collections payment | §8 |
| I | Driver cash custody handover | §9 |

---

## 1. Flow A — Cash payment

**When this happens:** Customer hands cash to the driver at delivery.

### 1.1 Entrypoint

| Surface | File | Trigger |
| --- | --- | --- |
| Driver POS | `web/src/modules/driver/pages/DriverPOS.tsx` | "إنهاء الطلب" button |
| Manager POS | `web/src/pages/pos-page.tsx` | "Complete order" |

Both call `useCheckoutSession.handleCheckoutNow()` which posts to:

- `POST /api/orders` (back-office manager intake)
- `POST /api/orders/quick` (driver self-service)

### 1.2 Services touched

```
OrdersController.create | createQuick
  └→ OrdersService.createAsManager | createQuick
       └→ (later, on PATCH /api/orders/:id status=COMPLETED)
            OrdersService.updateOrder
              └→ CustomerLedgerService.applyOrderWalletSettlementForCompletedOrder
                   └→ DoubleEntryJournalService.appendInvoiceIssuanceEntrySafe
                   └→ GeneralLedgerService.append (legacy mirror)
                   └→ InventoryService.applyOrderStockDecrement
```

### 1.3 Transactions

Two `prisma.$transaction` boundaries:

| Phase | What's atomic |
| --- | --- |
| Intake (`createAsManager`) | Customer find/create + serial counter increment + Order.create + OrderLineItem.create |
| Completion (`updateOrder` → settlement) | Wallet lock + wallet update + TransactionHistory + DebtLedgerEntry (if shortfall) + JournalEntry + GeneralLedgerEntry + Inventory decrement |

### 1.4 Journal writes

For pure CASH that fully covers the order:

| Account | Debit | Credit |
| --- | --- | --- |
| `ACCOUNTS_RECEIVABLE` | `totalPrice` | — |
| `REVENUE` | — | `totalPrice` |

**`sourceRef`:** `INVOICE_ISSUANCE:<orderId>`

The wallet is **untouched** (V20.1 hotfix — `shouldUseWallet=false`
for CASH, KNET, ONLINE, PAYMENT_LINK).

### 1.5 SourceRefs written

| `sourceRef` | Table | Purpose |
| --- | --- | --- |
| `INVOICE_ISSUANCE:<orderId>` | `JournalEntry` | DR AR / CR Revenue |
| (no `DebtLedgerEntry` row) | — | No shortfall to record |

### 1.6 Invariants enforced

- `OrdersService.reconcileLineItems`: Σ(qty × unitPrice) == totalPrice (Decimal compare).
- `assertOrderStatusTransition`: state machine (PENDING → COMPLETED only).
- `lockCustomerWalletForUpdateTx`: wallet row lock prevents races.
- `appendBalanced`: Σ debit == Σ credit (±0.001 KWD).
- `assertWriteAllowed`: period-lock guard.
- Idempotency: `walletSettledAt != null` short-circuits re-completion.

### 1.7 Cash custody after-flow

Cash custody is a **separate flow** (see §9). The order's
`cashStatus` transitions:

```
PAID_TO_DRIVER → HANDED_OVER_TO_OFFICE → (manager bag in PENDING_DEPOSIT)
              → (slip uploaded)         → AWAITING_VERIFICATION
              → (accountant verifies)   → VERIFIED
```

---

## 2. Flow B — KNET handheld

**When this happens:** Customer pays with KNET card on the driver's
handheld POS device at delivery.

### 2.1 Entrypoint

Same as cash: Driver POS or Manager POS, completes the same way.

### 2.2 Differences from cash

KNET handheld is **structurally identical** to cash. The only
differences:

| Field | Cash | KNET handheld |
| --- | --- | --- |
| `posPaymentMethod` | `CASH` | `KNET` |
| `cashStatus` after completion | `PAID_TO_DRIVER` | `PAID_TO_DRIVER` |
| Cash custody flow | YES (driver hands cash to manager) | NO (KNET settles directly to bank via gateway provider) |

### 2.3 Journal writes

Identical to cash:

| Account | Debit | Credit |
| --- | --- | --- |
| `ACCOUNTS_RECEIVABLE` | `totalPrice` | — |
| `REVENUE` | — | `totalPrice` |

`sourceRef = INVOICE_ISSUANCE:<orderId>`.

### 2.4 Reconciliation

Bank settlement files arrive daily. The accountant cross-checks
KNET totals via:

- `web/src/modules/accountant/pages/KnetAudit.tsx` (frontend file
  parser).
- Compared against `IssuedInvoicesReport` (`/api/finance/issued-invoices`).

Mismatches surface as accountant tasks; **no automatic write**
happens — drift requires human investigation.

---

## 3. Flow C — KNET online (gateway / hosted page)

**When this happens:** Customer clicks a payment link sent via
WhatsApp by the call centre. The link opens the UPayments-hosted
KNET page.

### 3.1 Entrypoint

| Surface | File | Trigger |
| --- | --- | --- |
| Customer link (mock) | `payment-result-page.tsx` | `/payment/success` URL |
| Customer link (real) | UPayments hosted page | UPayments redirect |

The flow is **webhook-driven**:

- UPayments → `POST /api/payments/callback`
- Customer browser → `GET /api/payments/status/:orderId` (polling)
- CC operator → `POST /api/payments/recheck/:orderId` (manual)

### 3.2 Services touched

```
PaymentsController.callback | status | recheck
  └→ PaymentsService.fetchGatewayStatus
       (server-side GET https://upayments.com/api/v1/get-payment-status/{trackId})
  └→ PaymentsService.validateFinalizeGatewayMetadata
       (amount mismatch → reject)
  └→ PaymentsService.finalizePaidOrderFromGateway
       └→ tx.order.updateMany WHERE walletSettledAt:null, status:not COMPLETED
            (CONDITIONAL CLAIM — first writer wins)
       └→ CustomerLedgerService.applyOrderWalletSettlementForCompletedOrder
       └→ GeneralLedgerService.append POS_SALE_COMPLETED
       └→ InventoryService.applyOrderStockDecrement
```

### 3.3 Server-side gateway verification (the critical step)

Before any journal write, the system **must** confirm with UPayments
that the gateway captured the payment:

1. Extract `trackId` / `trans_id` from the callback body.
2. Server-side call to `https://upayments.com/api/v1/get-payment-status/{trackId}`.
3. Compare gateway `result.order.id` to our `Order.id`.
4. Compare gateway amount (minor units) to `order.totalPrice` (minor units).
5. If amounts differ OR result is not `success` → **reject**, no finalize.

A spoofed return URL **cannot** trigger a journal write. A duplicate
webhook hits the unique `sourceRef` and short-circuits.

### 3.4 Conditional claim

```ts
const claim = await tx.order.updateMany({
  where: { id: orderId, walletSettledAt: null, status: { not: COMPLETED } },
  data:  { status: COMPLETED, walletSettledAt: now },
});
if (claim.count === 0) {
  return { duplicate: true };  // already settled, no-op
}
```

This is the row-level idempotency primitive: only one HTTP request
can win the claim, even if 5 webhooks fire simultaneously.

### 3.5 Hardening: `forceCapturedFinalize`

Documented at `payments.service.ts:1810`:

> **DO NOT MODIFY — PAYMENT FINALIZATION GUARANTEE**

When UPayments reports CAPTURED but `validateFinalizeGatewayMetadata`
would otherwise reject (amount missing, edge case), the bypass
allows finalize to proceed BUT fires a Discord alert
(`captured_payment_not_finalized` / `finalize_failed`) so the
operator can investigate.

### 3.6 Journal writes

Same shape as cash:

| Account | Debit | Credit |
| --- | --- | --- |
| `ACCOUNTS_RECEIVABLE` | `totalPrice` | — |
| `REVENUE` | — | `totalPrice` |

`sourceRef = INVOICE_ISSUANCE:<orderId>`.

If `extraMetadata.debtSettled` is set (link was for a debt
collection), the wallet `debt` field is decremented by the
declared amount and the audit metadata is tagged
`reportingCategory = 'DEBT_COLLECTION_VIA_LINK'`.

### 3.7 Watchdog

`src/payments/payment-consistency-watchdog.service.ts` periodically
checks for:

- Orders with `posGatewayTrackId` set but no `walletSettledAt`
  after T+5 min → `captured_payment_not_finalized` alert.
- Orders with `walletSettledAt` set but no journal entry for the
  matching `sourceRef` → `finalize_failed` alert.

---

## 4. Flow D — Mixed payment

**When this happens:** Customer's wallet has some balance but not
enough; the rest is collected via cash, KNET, or link.

### 4.1 POS engine composition (frontend)

```
For each sub-order in the cart:
  lineSum = Σ(line.qty × line.unitPrice)
  walletCoversLinesOnly = (walletBalance + epsilon >= lineSum)
  baseDelivery = (isFirstSubOrder ? 0.250 : 0)
  deliveryForOrder = (walletCovers && lineSum>0) ? 0 : baseDelivery
  vipSurcharge = (vipEnabled && lineSum>0) ? 1.000 : 0
  netTotal = lineSum + deliveryForOrder + vipSurcharge
  needsExt = (netTotal > 0 AND walletBalance < netTotal)

If allNeedExternal → KNET / online flow (Flow B / C)
If walletCovers → SUBSCRIPTION_WALLET path (Flow E)
```

The **frontend computes the cart** but the **backend re-validates**
via `OrdersService.reconcileLineItems` — frontend cart math cannot
manipulate the journal.

### 4.2 Settlement branches

`posPaymentMethod` resolved by the POS engine determines the path:

| `posPaymentMethod` | `shouldUseWallet` | Wallet effect | Journal entry |
| --- | --- | --- | --- |
| `CASH`, `KNET`, `ONLINE`, `PAYMENT_LINK` | false | Untouched | DR AR / CR Revenue |
| `SUBSCRIPTION_WALLET` | true | Drained up to balance; shortfall → debt | DR AR / CR Wallet Liability + DR Wallet Liability / CR AR (for absorbed portion) |
| `DEBT_ON_ACCOUNT` | true | Wallet absorbs first; shortfall → debt | Mixed: absorption + shortfall |

### 4.3 The V20.1 `safeTakeMinor` rule

Documented at `customer-ledger.service.ts:484-503`:

> The pre-V20.1 `takeMinor = min(balance, total)` could silently
> drain wallet on external payments. V20.1 introduces `safeTakeMinor`
> which is computed only when `shouldUseWallet=true`.
>
> **DO NOT reintroduce the alias.**

### 4.4 SourceRefs written

| Scenario | `sourceRef` | Table |
| --- | --- | --- |
| Wallet absorbed portion | `WALLET_ABSORB:<orderId>:<seq>` | `JournalEntry` + `DebtLedgerEntry` |
| Shortfall (debt portion) | `INVOICE:<orderId>:SHORTFALL` | `JournalEntry` + `DebtLedgerEntry` |
| Subscription overuse (wallet went negative) | `INVOICE:<orderId>:SUBSCRIPTION_OVERUSE` | `JournalEntry` + `DebtLedgerEntry` |

---

## 5. Flow E — Wallet / Subscription consumption

**When this happens:** Customer has an active subscription with a
positive wallet balance; an order is settled by drawing on it.

### 5.1 Activation

Subscription activation is via `SubscribersService` and creates:

- `CustomerSubscription` row with `balance = plan.totalValueKd`,
  `status = ACTIVE`.
- Wallet credit via `applyDeposit(...)` — writes a `JournalEntry`
  with `sourceRef = WALLET_TOPUP:<paymentId>` and an
  `accountId = WALLET_LIABILITY` credit.

### 5.2 Consumption

When an order is settled with `posPaymentMethod = SUBSCRIPTION_WALLET`:

```
Inside applyOrderWalletSettlementForCompletedOrder:

1. shouldUseWallet = true
2. safeTakeMinor   = min(balanceMinor, totalMinor)
3. shortfallMinor  = totalMinor - safeTakeMinor
4. newBalanceMinor = balanceMinor - safeTakeMinor    (can go NEGATIVE)
5. addedSubscriptionDebtMinor = subscription overuse if balance < 0
6. tx.customerWallet.update(balance=new, debt=new)
7. tx.transactionHistory.create(metadata.appliedFromWallet=...)
8. If shortfall > 0:
   tx.debtLedgerEntry.create(sourceRef="INVOICE:<id>:SHORTFALL")
   journal.mirrorDebtLedgerEntrySafe (DR AR / CR Wallet Liability)
9. If subscription went negative:
   tx.debtLedgerEntry.create(source=SUBSCRIPTION_OVERUSE)
   journal.mirrorDebtLedgerEntrySafe
   generalLedger.append(DEBT_ADJUSTMENT)
```

### 5.3 Wallet-absorption audit row

When wallet was used legitimately (positive balance covered the
order), an additional `DebtLedgerEntry` is written with:

- `source = PAYMENT`
- `sourceRef = PAYMENT:WALLET:<orderId>`

This row is **purely audit evidence** — it documents that the wallet
covered the invoice. `isRealDebtLedgerPayment` excludes the
`PAYMENT:WALLET:` prefix so it does not double-credit AR in
debt projections.

### 5.4 Subscription expiry

Expiry is recorded as `CustomerSubscription.status` transition
(ACTIVE → EXPIRED). The remaining wallet balance **stays in the
wallet** — it does not auto-refund. This is a business rule, not a
financial bug.

Domain event: `subscription.expired` (see [`event-map.md`](./event-map.md)).

---

## 6. Flow F — Debt settlement

**When this happens:** A customer with outstanding debt pays it down
via a link the call-center sent, or via cash collected at the office.

### 6.1 Variant F1 — Gateway debt-collection link

Same machinery as Flow C (KNET online), but the call-center sends
the link via WhatsApp with `extraMetadata.debtSettled = totalPrice`
and `debtSettlementViaLink: true` set on the order.

Inside `applyOrderWalletSettlementForCompletedOrder`:

```
- debtSettledStr = "<amount>" extracted from extraMetadata
- declaredSettledMinor = toMinorFromFixed4(debtSettledStr)
- debtPaydownFromSettlementMinor = min(declaredSettledMinor, newDebtMinor)
- newDebtMinor -= debtPaydownFromSettlementMinor
- Wallet.debt is decremented by exactly the debt portion paid down
- Audit metadata: reportingCategory = 'DEBT_COLLECTION_VIA_LINK'
  (read by the "Collected Today" KPI)
```

Journal write: same as Flow C (DR AR / CR Revenue).

### 6.2 Variant F2 — Call-center manual mark-paid

`call-center.service.markOrderPaid(...)` is called when the
customer pays in office cash and the CC agent records it.
Functionally equivalent: writes a `TransactionHistory` and
`DebtLedgerEntry` tagged with `debtSettlementViaCallCenter: true`,
decrements `wallet.debt`, writes the same canonical journal entry.

### 6.3 Idempotency

Both variants share the same canonical primitives:

- `sourceRef = INVOICE_ISSUANCE:<orderId>` UNIQUE on the journal
  short-circuits.
- `walletSettledAt: null` conditional update on the order claims
  the settlement exactly once.
- `DebtLedgerEntry` P2002 catch makes debt-row creation idempotent.

---

## 7. Flow G — Refund / Reversal (Invoice VOID)

**When this happens:** A supervisor or owner needs to undo an
invoice. There is **no partial refund** in the system — only full
invoice void + reissue.

### 7.1 Authorization

Restricted to **`CALL_CENTER_SUPERVISOR`** and **`OWNER`** roles
only. Drivers and managers cannot void invoices.

### 7.2 Entrypoint

```
POST /api/invoice-audit/orders/:id/void
  → InvoiceAuditController.voidInvoice
    → InvoiceAuditService.voidInvoice
```

### 7.3 Services touched (inside `prisma.$transaction`)

```
1. tx.order.findUnique → fail if status==CANCELED already
2. buildSnapshot(order) → before snapshot
3. reverseWalletForOrder(tx, order, actorId)
   - Restores subscription wallet balance / debt to PRE-settlement state
   - If subscription wallet was absorbed:
       journal.appendBalanced (source=WALLET_ABSORPTION_VOID,
       sourceRef="JOURNAL:WALLET_ABSORPTION_VOID:<orderId>")
       DR Wallet Liability / CR Accounts Receivable
4. tx.order.update(status=CANCELED, walletSettledAt=null)
5. orderArAtVoid = journal.getOrderArBalance(order.id)
   → Σ(DR AR) - Σ(CR AR) for this order
6. If orderArAtVoid > 0:
   journal.appendInvoiceCancellationEntrySafe(tx, {
     customerId, orderId, actorUserId,
     remainingArAmount: orderArAtVoid,
     reason
   })
   → DR Revenue Returns / CR Accounts Receivable
   → sourceRef = "JOURNAL:INVOICE_CANCELED:<orderId>" (idempotent)
7. generalLedger.append (POS_SALE_COMPLETED with negative amount,
   tagged source='SUPERVISOR_VOID') — legacy GL mirror
8. tx.invoiceAuditLog.create(action=VOID, beforeSnapshot, afterSnapshot)
9. Customer notification (out of $transaction)
```

### 7.4 Why VOID does not delete

The original invoice journal entry **stays exactly where it was
written**. The void writes a separate, contra-balanced reversal.
Net effect on AR: original DR AR cancels with new CR AR.
Auditor reads either entry independently.

### 7.5 Edit path

`InvoiceAuditService.editInvoice` exists for same-Kuwait-day
edits to `totalPrice` / `posPaymentMethod` / `notes`. It writes a
`traceDebtLedgerPaymentWrite` audit row and an `EDIT` log row.
Not a full reversal — only same-day cosmetic edits are allowed.

---

## 8. Flow H — Collections payment

**When this happens:** A customer in the collections workflow
(`NEW → CONTACTED → … → WRITTEN_OFF`) pays a portion of their debt
during a collections interaction.

### 8.1 Entrypoint

Most collections payments funnel through Flow F (debt settlement)
plus a **collections lifecycle event** that records the interaction:

```
POST /api/collections/payments
  → CollectionsWorkflowService.recordPayment
    → (Flow F2 above) — write the financial side
    → tx.collectionsStageEvent.create
       (append-only; transition NEW → IN_PROGRESS, etc.)
    → tx.promiseEvent.create (if a promise-to-pay was kept)
```

### 8.2 Lifecycle events (append-only)

The collections lifecycle is event-sourced:

| Stage | Event |
| --- | --- |
| NEW | `collections.stage.changed:NEW` |
| CONTACTED | `collections.stage.changed:CONTACTED` |
| PROMISE_RECEIVED | `collections.stage.changed:PROMISE_RECEIVED` |
| BROKEN_PROMISE | `collections.stage.changed:BROKEN_PROMISE` |
| ESCALATED | `collections.stage.changed:ESCALATED` |
| LEGAL | `collections.stage.changed:LEGAL` |
| RESOLVED | `collections.stage.changed:RESOLVED` |
| WRITTEN_OFF | `collections.stage.changed:WRITTEN_OFF` |

Every transition is an INSERT to `CollectionsStageEvent` (append-only
DB trigger). No row is ever updated.

### 8.3 Promises

`PromiseEvent` is similarly append-only. A promise-to-pay
(`PROMISED → KEPT | BROKEN`) is two rows: one for the promise, one
for the resolution.

---

## 9. Flow I — Driver cash custody handover

**When this happens:** Driver hands the day's cash to the manager;
manager deposits to bank; accountant verifies against the slip.

### 9.1 Entrypoint

```
POST /api/cash-flow/handover
  (legacy alias: POST /api/manager-custody/approve-receipt-from-driver)
  → CashService.confirmHandover
    → tx.order.findMany WHERE
        driverId, status=COMPLETED, cashStatus=PAID_TO_DRIVER,
        posPaymentMethod=CASH
    → systemMinor = sumOrderMinors(pending)
    → assertDeclaredMatchesLedgerMinor(systemMinor, declared)
    → tx.order.updateMany WHERE
        id IN (...), cashStatus=PAID_TO_DRIVER, posPaymentMethod=CASH
        data: cashStatus=HANDED_OVER_TO_OFFICE
    → tx.managerCashCustody.create
        (status=PENDING_DEPOSIT or AWAITING_VERIFICATION if slip provided)
    → AuditLogsService.logFinancialEvent (after success)
```

### 9.2 Bag lifecycle

```
PENDING_DEPOSIT
   │  (manager uploads deposit slip)
   ▼
AWAITING_VERIFICATION
   │  (accountant clicks verify)
   ▼
VERIFIED   (or REJECTED — cash returns to manager liability)
```

| Transition | Endpoint | Service |
| --- | --- | --- |
| Driver → Manager | `POST /api/cash-flow/handover` | `CashService.confirmHandover` |
| Manager → Bank slip upload | `POST /api/manager-custody/:id/upload-slip` | `ManagerCustodyService.uploadDepositSlip` |
| Accountant verify | `POST /api/manager-custody/:id/verify` | `ManagerCustodyService.verifyCustody` |
| Accountant reject | `POST /api/manager-custody/:id/reject` | `ManagerCustodyService.rejectCustody` |

### 9.3 Concurrency safety

`tx.order.updateMany` is a conditional update — if `updated.count !=
pending.length`, throws `ConflictException("Concurrent handover
detected")`. The retry will see the orders already in
`HANDED_OVER_TO_OFFICE` and short-circuit.

### 9.4 Side effects

- `CashClassifierService` (the SSoT for the traffic-light) reads
  the live snapshot and recomputes via `@Interval` poll.
- `CashExecutionTrackerService` logs `TRANSFER` / `DEPOSIT` /
  `VERIFY` events.
- `DriverAmountAuditService` cross-checks classifier ↔ executive ↔
  risk for zero drift.

### 9.5 No journal write at handover

Handover is a **custody transfer**, not a financial event. The
journal entry for the underlying CASH order was already written at
order completion (DR AR / CR Revenue). The handover only changes
who is *physically* holding the cash, not the accounting truth.

The bank deposit, when verified, may write a journal entry in
some configurations — see `BankDepositsService` for branch-level
deposit journal writes.

---

## 10. Cross-flow invariants

These rules apply to **every** flow above:

1. **Single canonical writer:** Every journal write goes through
   `DoubleEntryJournalService.appendBalanced`. No exceptions.
2. **Atomic transactions:** Every multi-step write uses
   `prisma.$transaction`. No "half-settled" state is possible.
3. **Row-level locking:** Every wallet update acquires
   `SELECT … FOR UPDATE` via `lockCustomerWalletForUpdateTx`.
4. **Decimal precision:** Every monetary value is `Prisma.Decimal`
   internally; conversion to integer minor units via
   `toMinorFromFixed4`. No `parseFloat` / `Number()` in any
   execution path.
5. **Idempotency:** Every external trigger (webhook, retry, manual
   recheck) hits the same `sourceRef` on the journal and the same
   conditional `updateMany` claim on the order. Duplicates land as
   no-ops.
6. **Period-lock:** Every journal write is gated by
   `PeriodLockGuard.assertWriteAllowed`. Closed-period writes
   throw and record a `FinancialPeriodViolation`.
7. **Append-only:** No flow ever issues `prisma.journalEntry.update`
   or `prisma.debtLedgerEntry.update`. Corrections are reversals
   (Flow G).
8. **Frontend display-only:** Frontend may compose the cart but may
   never compute the truth. The backend re-validates every cart via
   `OrdersService.reconcileLineItems`.

---

## 11. Quick-reference: `sourceRef` cheat-sheet by flow

| Flow | `sourceRef` written |
| --- | --- |
| A — Cash | `INVOICE_ISSUANCE:<orderId>` |
| B — KNET handheld | `INVOICE_ISSUANCE:<orderId>` |
| C — KNET online | `INVOICE_ISSUANCE:<orderId>` (+ `PAYMENT:<paymentId>` for the payment row) |
| D — Mixed | `WALLET_ABSORB:<orderId>:<seq>` + `INVOICE:<orderId>:SHORTFALL` (if shortfall) |
| E — Wallet/Subscription | `INVOICE:<orderId>:SHORTFALL` (if shortfall) + `INVOICE:<orderId>:SUBSCRIPTION_OVERUSE` (if balance went negative) + `PAYMENT:WALLET:<orderId>` (audit row) |
| F — Debt settlement | `INVOICE_ISSUANCE:<orderId>` (with `debtSettlementViaLink` / `debtSettlementViaCallCenter` metadata) |
| G — Refund/Void | `JOURNAL:WALLET_ABSORPTION_VOID:<orderId>` + `JOURNAL:INVOICE_CANCELED:<orderId>` |
| H — Collections payment | (same as F) + `CollectionsStageEvent` row + optional `PromiseEvent` row |
| I — Cash handover | (no journal write) — `ManagerCashCustody` row only |
