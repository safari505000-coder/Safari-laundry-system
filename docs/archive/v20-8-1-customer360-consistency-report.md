# V20.8.1 — Customer 360 Consistency Report

**Mission:** Repair Customer 360 subscription / debt / wallet projections.
**Hard rule (honoured):** Canonical financial logic, ledger invariants, journal balancing, reconciliation, and historical journal rows are UNTOUCHED.

---

## 1. Root cause (CASE #1)

Pre-V20.8.1 `subscriptionConsumedKd` was computed as

```
Σ(active orders whose posPaymentMethod === SUBSCRIPTION_WALLET)
```

which only catches POS sales paid directly from the subscription wallet. The audit-only ledger row that records wallet-absorption against an unpaid invoice (`sourceRef = "PAYMENT:WALLET:<orderId>:APPLIED"`) was never consulted, so the projection reported `consumed = 0` even after the wallet had been drawn down.

## 2. Fix

A new pure projection `computeSubscriptionConsumption()` in `src/customers/subscription-consumption.projection.ts` is the **single canonical source of truth**:

```
subscriptionConsumed =
    Σ(direct subscription-wallet orders for this subscription)
  + Σ(wallet-absorption ledger rows since `subscriptionActivatedAt`)

subscriptionRemaining = max(0, planActualBalanceSnapshot - subscriptionConsumed)
```

Wired into `computeCustomerFinancials` and `computeCustomer360FinancialCore` (both in `src/customers/customer-360-financials.ts`). The fix is **strictly additive**:

- Pre-V20.8.1 callers that don't pass `walletAbsorptionLedger` get the legacy direct-orders-only number — byte-identical.
- The DB adapter now also reads `sourceRef`, `createdAt`, and `subscription.activatedAt`, then routes the matching wallet-absorption rows through the projection.
- No journal rows mutated; no ledger rows mutated; no historical financial computations changed.

## 3. Customer 360 DTO additions (Phase 4)

`Customer360FinancialsDto.breakdown` (new, additive):

| Field | Source | Concept |
|---|---|---|
| `receivableDebtKd` | `canonicalDebtKd` | What the customer OWES |
| `subscriptionRemainingKd` | new projection | Active package remaining |
| `walletPrepaidCreditKd` | `max(0, walletBalance - subscriptionRemaining)` | Non-subscription prepaid credit |
| `paidTotalKd` | `totalPaymentsKd` | Historical settlements |
| `operatorHint` | server-built sentence | Plain-language summary |

The four numbers are server-canonical strings. UI consumers MUST pick the field that matches the concept and never sum/subtract them client-side (existing V20.7 build-fail UI guards already enforce this).

## 4. Test coverage (42 V20.8.1 tests)

### Backend (35)
| Suite | Tests | Highlights |
|---|---|---|
| `customers/v20-8-1-subscription-consumption.spec.ts` | 10 | CASE #1 reproduction + over-consumption clamp + activation cutoff |
| `customers/v20-8-1-financial-breakdown.spec.ts` | 6 | DTO contract + walletPrepaid math + operatorHint wording |
| `finance/v20-8-1-partial-payment-visibility.spec.ts` | 10 | 4/9.9/wallet-mix/tolerance pinned across all visibility surfaces |
| `domain-events/handlers/v20-8-1-snapshot-invalidation.spec.ts` | 9 | Refresh fired on wallet-absorbed / payment-partial / payment-captured / subscription-activated |

### Frontend (7)
| Suite | Tests | Highlights |
|---|---|---|
| `web/src/modules/finance/components/v20-8-1-financial-breakdown.test.tsx` | 7 | Explicit Arabic labels, red/green/blue tone separation, server-canonical strings rendered verbatim |

### Regression
- `src/customers` — 33 / 33 pre-existing tests still pass
- `src/finance` — full suite passes
- `src/customer-ledger`, `src/general-ledger`, `src/domain-events` — full suites pass
- `web/src/modules/finance` — 81 / 81 frontend tests still pass

## 5. CASE #1 (subscription absorption) — verified end-to-end

Reproduction (`v20-8-1-subscription-consumption.spec.ts` test #10 + `v20-8-1-financial-breakdown.spec.ts` test #6):

| Step | Customer 360 (pre) | Customer 360 (post) |
|---|---|---|
| 3.250 KD invoice unpaid | `due = 3.250` | `due = 3.250` |
| 25 KD subscription activated | `value=25, consumed=0, remaining=25` | `value=25, consumed=0, remaining=25` |
| 3.250 KD absorbed from wallet | `value=25, consumed=0, remaining=25` ⛔ | `value=25, consumed=3.25, remaining=21.75` ✅ |

## 6. CASE #2 (statement confusion) — verified

The statement DTO already carried the four distinct balances; the V20.8.1 fix:

- adds the explicit `breakdown` block so the operator gets a server-built sentence (`operatorHint`).
- adds the `Customer360FinancialBreakdown` UI component that renders the four concepts with explicit Arabic labels and red/green/blue tone separation.

Operators no longer see ambiguous "الرصيد"; they see four explicit tiles each with its own label, tooltip, and color.

## 7. CASE #3 (partial payment visibility) — verified

10 hard invariant tests pin the contract:
- 10 KD invoice / 4 KD paid → `PARTIALLY_PAID`, `isFullyPaid=false`
- 10 KD / 9.9 KD paid → still `PARTIALLY_PAID` (residual 0.1 > tolerance 0.001)
- 10 KD / 9.99 KD paid → still `PARTIALLY_PAID` (residual 0.01 > tolerance)
- 10 KD / 5 cash + 4 wallet → 1 KD remains, still `PARTIALLY_PAID`
- 10 KD / 10 KD → `PAID`, `isFullyPaid=true`
- Tolerance behaviour pinned at the boundary (≤ 0.001 → PAID; > 0.001 → OPEN)
- Two-way invariant: `remaining > tolerance ⇔ NOT fullyPaid`

A single canonical helper (`InvoicePaymentStatusService.derivePaymentStatus` / `statusFromRemaining`) feeds outstanding, aging, collections, debt aggregate, and Customer 360 — the contract test makes any future filter change that hides partially-paid receivables fail loudly.

## 8. Snapshot / cache invalidation (Phase 6)

All four mutation events trigger Customer 360 snapshot refresh, pinned by 9 hard tests:

- `finance.wallet.absorbed` → `WALLET_ABSORBED`
- `finance.payment.partial` → `PARTIAL_PAYMENT_RECORDED`
- `finance.payment.captured` → `PAYMENT_CAPTURED`
- `finance.subscription.activated` → `SUBSCRIPTION_ACTIVATED`

The wildcard listener (`@OnEvent('finance.*')`) means new events automatically flow into the same refresh path. The `finance.snapshot.refreshed` self-event is intentionally skipped to avoid feedback loops.

## 9. Files changed

### Added
- `src/customers/subscription-consumption.projection.ts` — canonical projection helper
- `src/customers/v20-8-1-subscription-consumption.spec.ts` — 10 tests
- `src/customers/v20-8-1-financial-breakdown.spec.ts` — 6 tests
- `src/finance/v20-8-1-partial-payment-visibility.spec.ts` — 10 tests
- `src/domain-events/handlers/v20-8-1-snapshot-invalidation.spec.ts` — 9 tests
- `web/src/modules/finance/components/Customer360FinancialBreakdown.tsx` — UI component
- `web/src/modules/finance/components/v20-8-1-financial-breakdown.test.tsx` — 7 tests
- `docs/v20-8-1-financial-projection-forensic-report.md`
- `docs/v20-8-1-customer360-consistency-report.md`
- `docs/v20-8-1-partial-payment-validation-report.md`
- `docs/v20-8-1-final-validation.md`

### Modified (additive only)
- `src/customers/customer-360-financials.ts` — wires the canonical projection in + reads wallet/activation/sourceRef + builds breakdown
- `src/customers/customer-360.types.ts` — adds `breakdown: Customer360FinancialBreakdownDto`
- `src/customers/sanitize-customer-360-view.ts` — prefers `operatorHint` for friendly summary
- `src/customers/sanitize-customer-360-view.spec.ts` — fixture updated to satisfy new DTO field
- `web/src/modules/finance/components/index.ts` — exports the breakdown component

### Untouched (per HARD RULE)
- All journal/ledger services
- All reconciliation logic
- All `computeOrderRemainingBalancesBatch` / canonical debt helpers
- All historical journal rows (no migration)
- All double-entry rules
- All AR balance computations
