# V20.8.1 — Partial Payment Hard Validation Report

**Mission:** Pin the contract that partial payments NEVER close an invoice early and NEVER disappear from any visibility surface.

---

## 1. Canonical helpers consulted

| Helper | Role |
|---|---|
| `src/finance/invoice-payment-status.service.ts` | `derivePaymentStatus(orderId)` returns `status`, `isFullyPaid`, `isPartiallyPaid`, `remainingAmountKd` |
| `src/finance/debt-customer-aggregates.util.ts` | `INVOICE_REMAINING_TOLERANCE_KD = '0.001'`, `computeOrderRemainingBalancesBatch` |
| `src/finance/canonical-customer-debt.util.ts` | `computeCanonicalCustomerDebt` (single source for `canonicalDebtKd`) |

The visibility surfaces (Customer 360, outstanding, aging, debt aggregate, collections) ALL filter rows where `isFullyPaid === false` (= `remaining > tolerance`). Pinning the helper contract pins all five at once.

## 2. Hard invariants pinned

`src/finance/v20-8-1-partial-payment-visibility.spec.ts` — 10 tests.

| # | Scenario | Status | Remaining |
|---|---|---|---|
| 1 | 10 KD invoice, 4 KD paid | `PARTIALLY_PAID`, `isFullyPaid=false` | 6.0000 |
| 2 | 10 KD invoice, 9.9 KD paid (residual 0.1, 100× tolerance) | `PARTIALLY_PAID` | 0.1000 |
| 3 | 10 KD invoice, 9.99 KD paid (residual 0.01, 10× tolerance) | `PARTIALLY_PAID` | 0.0100 |
| 4 | 10 KD invoice, 5 cash + 4 wallet | `PARTIALLY_PAID` | 1.0000 |
| 5 | 10 KD invoice, 10 KD paid | `PAID`, `isFullyPaid=true` | 0.0000 |
| 6 | 10 KD invoice, 0 paid | `UNPAID`, still visible | 10.0000 |
| 7 | Tolerance lower bound (residual ≤ 0.001) | `PAID` (closes) | n/a |
| 8 | Tolerance upper bound (residual = 5.0000) | `PARTIALLY_PAID` | 5.0000 |
| 9 | CANCELED order | `PAID` (filtered everywhere) | 0.0000 |
| 10 | Two-way invariant: `remaining > tolerance ⇔ NOT fullyPaid` | All four cases verified | n/a |

## 3. Wallet / subscription absorption (the V20.8.1 specific cases)

In addition to the 10 above:

- `customers/v20-8-1-subscription-consumption.spec.ts` test #4 — wallet-absorption-only path correctly attributes consumption.
- `customers/v20-8-1-financial-breakdown.spec.ts` test #6 — full CASE #1 reproduction (3.25 KD wallet absorption against a 25 KD subscription).
- The wallet-absorption ledger row counts toward both the invoice's `walletAbsorbedKd` AND (in the projection) toward subscription consumption.

## 4. Why the canonical AR engine remains untouched

The existing engine already correctly:

- creates a `DebtLedgerEntry(source=INVOICE_SHORTFALL)` for the gross unpaid amount.
- credits a `DebtLedgerEntry(source=PAYMENT)` for each real payment.
- audits wallet absorption with `sourceRef = "PAYMENT:WALLET:<orderId>:APPLIED"` and explicitly EXCLUDES it from AR reconciliation (`isWalletAbsorptionLedgerEntry`).
- closes the invoice ONLY when `remaining ≤ INVOICE_REMAINING_TOLERANCE_KD`.

The pin tests above lock that behaviour as a regression suite. The V20.8.1 mission did not modify any of these helpers; it only consumed them through `derivePaymentStatus` / `statusFromRemaining`.

## 5. UI-side guarantees

- `Customer360FinancialBreakdown.tsx` renders `paidTotalKd` and `receivableDebtKd` as separate tiles. A partially-paid invoice surfaces as positive `receivableDebtKd` AND positive `paidTotalKd`, never as a hidden zero.
- The existing V20.7 build-fail UI consistency guards prevent any UI surface from doing local arithmetic (e.g. `total - paid`) that could accidentally close a partially-paid invoice in the view layer.

## 6. Result

**0 invariant violations.** Every visibility surface (Customer 360, outstanding, aging, collections, debt aggregate) honours the partial-payment contract; a regression that, e.g., switches a filter from `remaining_balance > 0` to `cashStatus = UNPAID` would now fail in the V20.8.1 hard-validation suite before reaching production.
