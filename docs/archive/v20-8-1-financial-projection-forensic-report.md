# V20.8.1 — Financial Projection Forensic Report

**Mission:** Safe projection / snapshot / UI-derivation repair (canonical financial engine UNTOUCHED).

---

## 1. Trace results

### 1.1 Subscription consumption — root cause of CASE #1

**File:** `src/customers/customer-360-financials.ts`
**Function:** `computeCustomerFinancials` → `subscriptionConsumedKd`

The current calculation:

```ts
const subscriptionConsumedKd = data.subscription
  ? round(
      activeOrders
        .filter((o) => isSubscriptionPaidOrder(o, subscriptionId))
        .reduce((sum, o) => sum + orderAmount(o), 0),
    )
  : 0;
```

Where `isSubscriptionPaidOrder` returns true only when `paymentSourceForOrder(order.posPaymentMethod) === 'SUBSCRIPTION'` — i.e. only when `posPaymentMethod === SUBSCRIPTION_WALLET`.

**The drift:** Wallet absorption of an unpaid invoice (e.g. invoice was created with `posPaymentMethod = CASH` or `DEBT_ON_ACCOUNT`, then later absorbed from the subscription wallet) does NOT change the order's `posPaymentMethod`. The absorption is recorded as a `DebtLedgerEntry` row with:

- `source = PAYMENT`
- `sourceRef = PAYMENT:WALLET:<orderId>:APPLIED`
- `note = 'Wallet credit applied to invoice (audit only — not AR-reducing)'`

The Customer 360 financial engine does NOT consult these rows. Result: `subscriptionConsumedKd = 0` even when the wallet absorbed money against the subscription.

**Reproduction (CASE #1):**

| Step | Wallet | Subscription remaining | Customer 360 says |
|---|---|---|---|
| Open invoice 3.250 KD (DEBT_ON_ACCOUNT) | 0.000 | — | totalDue = 3.250 |
| Activate subscription 25 KD | 25.000 | 25.000 | value=25, consumed=0, remaining=25 |
| Wallet absorbs 3.250 KD against invoice | 21.750 | should be **21.750** | value=25, **consumed=0, remaining=25** ⛔ |

### 1.2 Statement balance confusion — CASE #2

**File:** `web/src/modules/call-center/components/statement-dialog.tsx`
**Source:** `ledger.customer.walletBalanceKd`, `walletDebtKd`, `effectiveDebtKd`, `operationalDebtKd`

The endpoint surfaces 4 distinct balances but the UI labels collapse them into "الرصيد" (the balance). Operators read "balance = 0" and conclude the customer owes nothing — but in fact:

- `walletBalanceKd` could be 21.750 (subscription remaining)
- `effectiveDebtKd` could be 0 (nothing owed)
- `walletDebtKd` could be 0

Both states render as ambiguous "0". The fix is purely a wording/visual-hierarchy change — the data is correct, the labels are not.

### 1.3 Partial payment visibility — CASE #3

**Files traced:**
- `src/finance/invoice-payment-status.service.ts` — open/closed status helper
- `src/finance/outstanding/outstanding.service.ts` — outstanding query
- `src/finance/aging/aging.service.ts` — aging buckets
- `src/finance/canonical-customer-debt.util.ts` — canonical debt
- `src/finance/debt-customer-aggregates.util.ts` — partial payment Σ remaining

The canonical engine is correct: a 10 KD invoice with a 4 KD payment yields `remaining_balance = 6` and `cashStatus != PAID`. All four query paths above respect this.

**The gap:** No build-fail invariant test pins down ALL FIVE visibility surfaces (Customer 360, outstanding, aging, debt aggregate, collections) in a single regression suite. A future refactor that, e.g., changes an outstanding filter from `remaining_balance > 0` to `cashStatus = UNPAID` would silently hide partially-paid receivables.

### 1.4 Cache invalidation — sound but undocumented

**File:** `src/domain-events/handlers/financial-snapshot.listener.ts`

Snapshot refresh is correctly triggered on `finance.wallet.absorbed`, `finance.payment.captured`, `finance.payment.partial`, `finance.subscription.activated`. The snapshot service writes the projected balances into `CustomerFinancialSnapshot`.

**The gap:** the snapshot fields named `subscriptionConsumedKd` / `subscriptionRemainingKd` are derived from the same broken `computeCustomerFinancials` function, so the snapshot ALSO reports the wrong consumption for absorbed invoices.

---

## 2. Inventory of duplicated / risky calculations

| Location | Calculation | Status |
|---|---|---|
| `customer-360-financials.ts::subscriptionConsumedKd` | only `posPaymentMethod=SUBSCRIPTION_WALLET` orders | **BUG — fix in V20.8.1** |
| `financial-snapshot.service.ts` (subscription fields) | downstream of the above | Auto-fixed by Phase 3 |
| Customer 360 `totalDueKd` | `max(invoices - payments, 0)` | Correct (legacy field) |
| `canonicalDebtKd` | live JOURNAL or partial-payment Σ remaining | Correct (canonical) |
| Frontend `web/src/lib/api.ts` | passes server fields verbatim | Correct |
| Statement dialog | reads server `walletBalanceKd` + `effectiveDebtKd` | Correct (label-only fix in Phase 7) |
| Customer 360 frontend (`pages/customer-portal-360-page.tsx`) | renders subscription block from server fields | Correct (label clarity in Phase 7) |

**No frontend-side KD math** was introduced post-V20.7 (the V20.8 expanded UI consistency guard is still passing). The drift is **server-side projection drift only**.

---

## 3. Fix plan (Phases 2–7)

1. **Phase 2** — Add a canonical projection helper `computeSubscriptionConsumption()` that consults BOTH:
   - subscription-paid orders (existing path)
   - wallet-absorption ledger entries since `subscriptionActivatedAt`
2. **Phase 3** — Wire it into `computeCustomerFinancials` so `subscriptionConsumedKd` and `subscriptionRemainingKd` reflect absorption.
3. **Phase 4** — Add 4 new EXPLICIT financial fields to the Customer 360 DTO (additive; existing fields untouched):
   - `receivableDebtKd` ← canonical debt (debt OWED by customer)
   - `subscriptionRemainingKd` ← fixed
   - `walletPrepaidCreditKd` ← non-subscription prepaid balance
   - `paidTotalKd` ← historical settlements
5. **Phase 5** — Hard partial-payment regression suite covering all 5 visibility surfaces.
6. **Phase 6** — Document the existing snapshot triggers + add a regression test that asserts `finance.wallet.absorbed` triggers snapshot refresh (no behaviour change; pins the contract).
7. **Phase 7** — Frontend label rewrite + color separation.

Each phase is **strictly additive**; the canonical engine, ledger invariants, journal balancing, and historical journal rows are NEVER touched.
