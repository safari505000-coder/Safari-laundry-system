# V21 Dead Financial Layer Removal Report

Date: 2026-05-08

This report tracks financial duplicate layers removed or isolated during the V21 Canonical Banking Core migration. It is intentionally conservative: no journal, ledger, reconciliation, audit, historical row, or snapshot invariant was altered.

## Removed / Replaced In This Slice

| Area | Removed Duplicate Layer | Replacement | Rollback Safety |
| --- | --- | --- | --- |
| `web/src/pages/statement-print-page.tsx` | React-side statement total reducer for invoiced/paid/open totals | Backend `CustomerLedgerResponse.totals` from `computeCanonicalStatementTotals()` | Safe: display-only replacement |
| `web/src/pages/unpaid-invoices-page.tsx` | React-side cumulative remaining balance map | Backend `customerRunningRemainingKd` from `attachCanonicalRunningRemaining()` | Safe: display-only replacement |
| `web/src/pages/unpaid-invoices-page.tsx` print output | Local `money()` using inline `toFixed(3)` | `formatKwdAmount()` | Safe: display-only replacement |
| `web/src/pages/pos-page.tsx` | Inline POS money labels using `toFixed(3)` / manual suffix | `formatKwdLabel()` / `formatKwdAmount()` | Safe: display-only formatting replacement |
| `web/src/modules/finance/components/CustomerFinancialHeader.tsx` | Local `parseFloat` + `toLocaleString` formatter | `formatKwdLabel()` | Safe: display-only formatting replacement |
| `web/src/modules/finance/components/DebtCard.tsx` | Local `parseFloat` + `toLocaleString` formatter | `formatKwdLabel()` | Safe: display-only formatting replacement |
| `web/src/modules/driver/pages/driver-pending-invoices-page.tsx` | Local `formatKwd3()` helper with manual suffix and `.toFixed(3)` | `formatKwdLabel()` | Safe: display-only formatting replacement |
| `web/src/modules/driver/pages/my-deposits-page.tsx` | Local `formatKwd3()` helper with manual suffix and local `Intl` options | `formatKwdLabel()` | Safe: display-only formatting replacement |
| `web/src/pages/cash-receipt-print-page.tsx` | Local `formatKwd3()` print helper with manual suffix and local `Intl` options | `formatKwdLabel()` | Safe: display-only formatting replacement |

## Guarded Against Regression

`src/finance/v21-canonical-banking-guards.spec.ts` now protects migrated files from:

- inline `.toFixed(3)` money formatting,
- duplicate inline `Intl.NumberFormat` money formatters,
- manual Arabic KWD suffix string construction outside canonical formatter files.

## Not Removed Yet

These layers remain intentionally in place until their consumers are migrated and tests are added:

- Customer 360 legacy `totalDueKd`.
- `getOperationalDebtKdBreakdown()` operational debt lens.
- POS domain arithmetic in `web/src/utils/finance-engine.ts`.
- Invoice supervisor same-day edit delta math.
- Dashboard/client report aggregations.
- Monthly print report local totals.
- Journal UI audit-only verification sums.
- Loan repayment math.

## Validation After This Slice

- Backend V21 guard: passed.
- Backend canonical projection/payment/money tests: passed.
- Backend build: passed.
- Frontend KWD tests: passed.
- Frontend build: passed.

