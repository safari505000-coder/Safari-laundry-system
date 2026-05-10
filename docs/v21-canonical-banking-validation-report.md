# V21 Canonical Banking Core Validation Report

Date: 2026-05-08

## Scope Validated In This Slice

This validation covers the V21 consolidation work completed so far:

- canonical contract files,
- canonical statement totals selector,
- canonical unpaid running receivable selector,
- KWD formatter migration on selected display surfaces,
- static guard coverage for migrated files,
- subscription-as-payment partial coverage tests from prior slice.

## Commands Run

| Command | Result |
| --- | --- |
| `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/canonical-payment-method.spec.ts src/finance/finance-money.spec.ts` | Passed |
| `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/canonical-payment-method.spec.ts src/finance/finance-money.spec.ts src/finance/invoice-payment-status.spec.ts src/customers/v20-8-1-subscription-consumption.spec.ts` | Passed |
| `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts` | Passed |
| `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts src/finance/canonical-financial-projection.spec.ts src/finance/canonical-payment-method.spec.ts src/finance/finance-money.spec.ts` | Passed |
| `npm run build` | Passed |
| `npm run test -- --run src/lib/kwd.test.ts` in `web/` | Passed |
| `npm run build` in `web/` | Passed |
| `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts src/finance/finance-money.spec.ts src/finance/canonical-financial-projection.spec.ts` | Passed |

## Current Architecture Scorecard

| Capability | Status | Notes |
| --- | --- | --- |
| Journal / ledger invariants | Preserved | No journal/reconciliation logic changed |
| Canonical contract entry points | Added | `canonical-money`, `canonical-subscription`, `canonical-invoice-status`, `canonical-customer-financials`, `canonical-financial-projection` |
| Statement totals | Canonicalized | Backend selector now feeds statement print |
| Unpaid running balances | Canonicalized | Backend row field now feeds page and print |
| Subscription partial coverage | Covered | Existing focused test confirms debt rollover and no hidden negative balance |
| Subscription driver cash routing | Covered | Existing cash-status tests classify subscription as book/electronic settlement |
| KWD formatting | Partially enforced | Central formatter exists; guard covers migrated files |
| Legacy debt consumers | Pending | `totalDueKd` and operational debt consumers still require migration |
| Dashboard/report aggregations | Pending | Several frontend report pages still have local sums |
| Realtime invalidation audit | Pending | Needs dedicated pass to ensure events only invalidate/refetch canonical projections |
| Full enterprise suite | Pending | Only focused suites/builds run in this slice |

## Remaining Technical Debt Map

High priority:

- Replace `totalDueKd` consumers with canonical debt.
- Restrict `operationalDebtKd` / `getOperationalDebtKdBreakdown()` to explicitly operational flows.
- Add journal-backed batch invoice remaining when safe and indexed.
- Remove POS wallet/subscription preview math or replace with server quote DTO.
- Remove invoice supervisor same-day edit local delta math.
- Move dashboard/report/monthly print totals to server DTOs.
- Migrate call-center duplicate `Intl.NumberFormat('ar-KW')` helpers to the central formatter.

Medium priority:

- Expand V21 static guards file-by-file as surfaces are migrated.
- Add frontend rendering tests for migrated statement/unpaid/POS formatter surfaces.
- Add realtime refetch/invalidation tests for Customer 360, collections, dashboard, and POS billing panel.

## Validation Position

V21 is partially migrated and stable for the completed slices. The system is not yet fully single-source across all dashboards, print pages, and operational screens. No accounting core, journal structure, reconciliation logic, historical rows, or immutable audit data was changed.

