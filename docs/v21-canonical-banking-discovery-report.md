# V21 Canonical Banking Core Discovery Report

Date: 2026-05-08

Scope: `src/` and `web/src/`

Mission: consolidate all financial reads, calculations, and formatting into one Canonical Banking Core Layer without modifying journal structure, double-entry accounting, reconciliation, historical rows, audit events, or ledger invariants.

## Canonical Banking Core Targets

These are the allowed financial read/calculation entry points for V21 migration:

| Concept | Canonical Target | Status |
| --- | --- | --- |
| Customer debt / AR | `computeCanonicalCustomerDebt()` via `src/finance/canonical-customer-debt.util.ts` | Existing canonical source |
| Invoice remaining | `computeOrderRemainingBalancesBatch()` and `InvoicePaymentStatusService` | Existing canonical source |
| Subscription consumption | `computeSubscriptionConsumption()` | Existing canonical source |
| Statement totals / running receivable | `src/finance/canonical-financial-projection.ts` | Added in V21 slice |
| KWD display formatting | `src/finance/finance-money.ts` and `web/src/lib/kwd.ts` | Existing, needs enforcement |
| Fast UI debt reads | `DebtVisibilityService` + `FinancialSnapshotService` | Existing snapshot-first facade |
| Customer 360 financials | `computeCustomer360FinancialCore()` + canonical debt/breakdown fields | Existing, consumers still need migration |

## Backend Discovery

| Path | Duplicated Logic Type | Risk | Migration Target | Delete-Safe Status |
| --- | --- | --- | --- | --- |
| `src/customers/customer-360-financials.ts` | Legacy `totalDueKd` exists alongside `canonicalDebtKd` | High | Prefer `canonicalDebtKd` / `breakdown` from `computeCustomer360FinancialCore()` | Not delete-safe until all consumers migrate |
| `src/finance/services/owner-financial-dashboard.service.ts` | Uses Customer 360 legacy due rollups for owner debt sorting/totals | High | `DebtVisibilityService` or `computeCanonicalCustomerDebt()` | Not delete-safe |
| `src/customers/customer-evaluator.ts` | Customer risk thresholds use legacy due concept | High | `computeCanonicalCustomerDebt()` | Not delete-safe |
| `src/common/services/customer-blocking.service.ts` | Auto-blocking uses legacy `totalDueKd` | High | `DebtVisibilityService.getCustomerVisibleDebt()` | Not delete-safe |
| `src/finance/services/customer-intelligence.service.ts` | Payment consistency uses legacy Customer 360 due | Medium | Canonical debt DTO field | Not delete-safe |
| `src/orders/orders.service.ts` | `getOperationalDebtKdBreakdown()` is an operational max-of-sources debt lens | High if used as canonical | Restrict to operational copy/guards only; canonical UI uses `computeCanonicalCustomerDebt()` | Not delete-safe |
| `src/finance/invoice-payment-status.service.ts` | Single invoice can read journal AR, batch still uses DebtLedger batch path | Medium | Add journal-backed batch path later, retain ledger batch until indexed journal batch exists | Not delete-safe |
| `src/finance/debt-visibility/debt-visibility.service.ts` | Live fallback returns partial zero-filled snapshot fields | Medium | Snapshot-first reads; improve projection completeness | Not delete-safe |
| `src/finance/services/debt.service.ts` | Unpaid invoice running balances and report rows historically assembled locally | Medium | `canonical-financial-projection.ts` selectors + invoice status service | Partially migrated |
| `src/call-center/call-center.service.ts` | Statement totals historically assembled in service body | Low after V21 selector extraction | `computeCanonicalStatementTotals()` | Delete-safe only for inline duplicate logic |
| `src/general-ledger/double-entry-journal.service.ts` | Journal statement running balance | Low | Authoritative journal reader; do not remove | Keep |
| `src/finance/snapshots/financial-snapshot.service.ts` | Materialized projection calculations | Low | Canonical snapshot layer | Keep |
| `src/finance/branches/branch-accounting.service.ts` | Branch trial/P&L journal reads | Low | Separate journal reporting lens | Keep |

## Frontend Discovery

| Path | Duplicated Logic Type | Risk | Migration Target | Delete-Safe Status |
| --- | --- | --- | --- | --- |
| `web/src/pages/unpaid-invoices-page.tsx` | Client cumulative remaining by customer, print money helper | High | Backend `customerRunningRemainingKd` + `formatKwdAmount()` | Partially migrated |
| `web/src/pages/statement-print-page.tsx` | Client statement invoiced/paid/open totals | High | Backend `CustomerLedgerResponse.totals` | Partially migrated |
| `web/src/pages/customer-statement-journal-page.tsx` | Local debit/credit/running balance reconstruction | High | Backend journal statement DTO | Not delete-safe |
| `web/src/utils/finance-engine.ts` | POS cart, delivery/VIP, local wallet burn-down simulation | High | Server quote/projection DTO or locked POS domain engine with tests | Not delete-safe |
| `web/src/modules/shared/hooks/use-pos-engine.ts` | POS payload totals, wallet/subscription display parts | High | Server canonical billing preview + shared KWD formatter | Not delete-safe |
| `web/src/pages/pos-page.tsx` | Inline KWD formatting for POS values | Medium | `web/src/lib/kwd.ts` | Partially migrated |
| `web/src/modules/shared/components/pos/pos-auxiliary-ui.tsx` | Receipt/print local KWD parts and totals | Medium | Shared KWD formatter and server receipt DTO | Not delete-safe |
| `web/src/components/orders/pos-invoice-print-view.tsx` | Duplicate `formatKwdParts`, local subtotal/debt display | Medium | Shared KWD formatter and backend invoice summary fields | Not delete-safe |
| `web/src/modules/shared/components/orders/invoice-supervisor-actions.tsx` | Same-day edit line total delta and local KWD formatter | High | Backend edit preview / canonical invoice status | Not delete-safe |
| `web/src/modules/finance/components/CustomerFinancialHeader.tsx` | Local `parseFloat` + locale formatter | Low | `formatKwdLabel()` | Delete-safe after replacement |
| `web/src/modules/finance/components/DebtCard.tsx` | Local `parseFloat` + locale formatter | Low | `formatKwdLabel()` | Delete-safe after replacement |
| `web/src/modules/finance/components/JournalEntryView.tsx` | Client debit/credit verification sums | Medium | Server-provided journal totals or explicit audit-only verifier | Not delete-safe |
| `web/src/modules/finance/components/MoneyFlowCard.tsx` | Local net = in - out | Medium | Server net field | Not delete-safe |
| `web/src/modules/call-center/**` | Multiple `Intl.NumberFormat('ar-KW')` helpers | Medium | One shared KWD formatter policy | Delete-safe after replacement |
| `web/src/modules/driver/pages/driver-pending-invoices-page.tsx` | Duplicate `formatKwd3` | Low | `formatKwdLabel()` | Delete-safe after replacement |
| `web/src/modules/driver/pages/my-deposits-page.tsx` | Duplicate `formatKwd3`, local sums | Medium | Server totals + `formatKwdLabel()` | Not delete-safe |
| `web/src/pages/financials-page.tsx` | Client sums over dashboard rows | High | Server KPI DTO totals only | Not delete-safe |
| `web/src/pages/monthly-report-full-print-page.tsx` | Payroll/report local totals | High | Server report DTO totals only | Not delete-safe |
| `web/src/pages/sales-summary-report-page.tsx` | Client export/report totals | Medium | Server report DTO totals | Not delete-safe |
| `web/src/pages/live-monitor-page.tsx` | Inline KWD formatting and KPI display formatting | Medium | Shared KWD formatter, canonical monitor DTO | Not delete-safe |
| `web/src/pages/loans-page.tsx` | Local repayment/remaining validation math | High | Loan service canonical balance DTO | Not delete-safe |

## Parallel Debt Source Inventory

| Source | Intended Use | V21 Rule |
| --- | --- | --- |
| `computeCanonicalCustomerDebt()` | Customer AR truth | Only allowed customer debt source |
| `totalDueKd` | Legacy Customer 360 due field | Deprecated; migrate consumers |
| `operationalDebtKd` | Operational call-center/subscription guard lens | Not canonical UI debt |
| `getOperationalDebtKdBreakdown()` | Operational max-of-sources reconciliation copy | Restricted to explicit operational flows |
| `wallet.debt` snapshot | Legacy/runtime wallet debt | Not standalone canonical debt |
| Client sums of invoices/payments | Historical UI convenience | Forbidden for canonical financial display |

## Duplicate Formatting Inventory

| Pattern | Examples | V21 Target |
| --- | --- | --- |
| Inline `.toFixed(3)` with `د.ك` | POS, print pages, loans, reports | `formatKwdLabel()` / `formatKwdAmount()` |
| Inline `.toFixed(4)` for display | reports/prints/payroll summaries | Backend DTO internal only; UI displays 3dp |
| `Intl.NumberFormat('ar-KW')` local helpers | Call-center dashboard/control tower | Central KWD formatter |
| `formatKwd3` duplicates | driver/receipt/manager print pages | Central KWD formatter |
| `formatKwdParts` duplicates | POS hook and invoice print | Central formatter or receipt DTO |

## Migration Order

1. Add contract wrapper files so consumers import only Canonical Banking Core APIs.
2. Replace legacy `totalDueKd` policy consumers with canonical debt.
3. Replace client running balances and statement totals with server fields.
4. Replace duplicate KWD formatters with centralized formatter.
5. Add static guards for new inline money formatting/math.
6. Migrate high-risk POS, invoice edit, dashboards, monthly reports to server quote/summary DTOs.
7. Mark legacy financial layers as `@deprecated` and migration-only.
8. Generate removal and validation reports after each deletion/migration pass.

## Delete-Safe Summary

Currently delete-safe:

- Inline statement total reducer in `web/src/pages/statement-print-page.tsx`.
- Inline unpaid invoice running-balance reducer in `web/src/pages/unpaid-invoices-page.tsx`.
- POS page inline display formatting replaced by shared KWD formatter.

Not delete-safe yet:

- Legacy Customer 360 `totalDueKd`.
- Operational debt breakdown helpers.
- POS finance engine.
- Invoice supervisor local delta math.
- Dashboard and monthly print report aggregations.
- Journal UI verification sums.
- Loan repayment math.

## V21 Architecture Scorecard

| Area | Score | Notes |
| --- | --- | --- |
| Accounting/journal invariants | Strong | Do not alter |
| Customer debt canonicalization | Medium | Canonical exists; consumers still mixed |
| Invoice remaining canonicalization | Medium | Canonical exists; journal batch path pending |
| Subscription projection | Strong | Canonical helper exists |
| Frontend display-only compliance | Low-Medium | Initial high-risk migrations done; many local helpers remain |
| KWD formatting consistency | Medium | Shared formatter exists; enforcement pending |
| Static guard coverage | Low | Needs V21 guard tests/scripts |
| Snapshot-first adoption | Medium | Debt visibility/snapshot exists; dashboard consumers need audit |

