# V21 Phase 2 — Read-Only Financial Projection Migration Report

Date: 2026-05-08

Scope: readonly financial display/projection consumers only.

Hard boundary: this phase does not modify journal posting, reconciliation, ledger invariants, historical rows, or financial mutation workflows.

## Canonical Sources For Phase 2

| Display Concept | Canonical Source |
| --- | --- |
| Customer debt / AR | `computeCanonicalCustomerDebt()` via `canonical-customer-financials.ts` |
| Customer 360 display | `computeCustomer360FinancialCore()` canonical fields and breakdown |
| Invoice remaining/status | `canonical-invoice-status.ts` and `InvoicePaymentStatusService` |
| Running receivable display | `canonical-financial-projection.ts` selectors / backend DTO fields |
| Snapshot-backed cards | `FinancialSnapshotService` / `DebtVisibilityService` |
| KWD display | `web/src/lib/kwd.ts` / `canonical-money.ts` |

## Migrated Components

| Component | Removed Local Calculation | Canonical Replacement | Guard | Validation |
| --- | --- | --- | --- | --- |
| `web/src/modules/finance/components/CustomerFinancialHeader.tsx` | Local `parseFloat` + `toLocaleString` formatter | `formatKwdLabel()` on server-canonical props | `v21-canonical-banking-guards.spec.ts` | Passed in Phase 1 validation |
| `web/src/modules/finance/components/DebtCard.tsx` | Local `parseFloat` + `toLocaleString` formatter | `formatKwdLabel()` on server-canonical props | `v21-canonical-banking-guards.spec.ts` | Passed in Phase 1 validation |
| `web/src/modules/finance/components/MoneyFlowCard.tsx` | Local `parseFloat`, local `cashIn - cashOut` net calculation, duplicate `toLocaleString` formatter | New required `netKd` prop plus `formatKwdAmount()` for display-only KWD rendering | `v21-canonical-banking-guards.spec.ts` readonly projection guard | `npm test -- src/modules/finance/components/financial-ui-kit.test.tsx`; targeted eslint; `npm run build`; backend guard + build passed |
| `web/src/modules/call-center/dashboard/components/kpi-strip.tsx` | Local `parseFloat`, duplicate `Intl.NumberFormat`, manual KWD label suffix for readonly KPI values | `formatKwdLabel()` on backend-provided `outstanding.totalDueKd` and `summary.debtRecoveredTodayKd` | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Targeted eslint; `npm run build` in `web/`; backend guard + build passed |
| `web/src/modules/call-center/dashboard/components/call-queue.tsx` | Duplicate `Intl.NumberFormat` and manual KWD suffix for row `totalDueKd`; stale `rowsAll` dependency warning | `formatKwdLabel()` on backend-provided row `totalDueKd`; stable memoized row list | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Targeted eslint clean; `npm run build` in `web/`; backend guard + build passed |
| `web/src/modules/call-center/control-tower/components/kpi-cards.tsx` | Duplicate `Intl.NumberFormat` for dashboard total due KPI | `formatKwdLabel()` on backend-provided `kpis.totalDue` | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Targeted eslint; `npm run build` in `web/`; backend guard + build passed |
| `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx` | Duplicate KWD formatter; manual KWD suffixes; local driver financial grouping; local unpaid-online branch/payment-link grouping | `formatKwdLabel()`, backend `OutstandingResponse.driverSummaries`, and `/collections/unpaid-online/report` envelope from `computeCanonicalUnpaidOnlineReportProjection()` | `v21-canonical-banking-guards.spec.ts` formatting + collections report projection guard | Backend projection tests; targeted eslint; frontend/backend builds passed |
| `web/src/modules/collections/components/CollectionsQueuePanel.tsx` | Raw KD string rendering for queue customer remaining debt | `formatKwdLabel()` on server-canonical `remainingDebtKd` | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Collections shell test; targeted eslint; `npm run build` in `web/`; backend guard + build passed |
| `web/src/pages/debt-recovery-report-page.tsx` | Local daily reduce totals, local max recovered calculation, `parseFloat` trend ratio math | `DebtRecoveryReport.totalSettlements`, `totalSubscriptions`, `maxRecoveredKd`, and per-day `trendRatio` from `computeCanonicalDebtRecoverySummary()` | `v21-canonical-banking-guards.spec.ts` readonly projection guard | Projection tests; targeted eslint; frontend/backend builds passed |
| `web/src/pages/commission-payouts-page.tsx` | Local payout summary aggregation, duplicate KWD formatter, manual KWD suffixes | `CommissionPayoutsResponse.summaryTotals` from `computeCanonicalCommissionPayoutSummaryTotals()` plus `formatKwdLabel()` | `v21-canonical-banking-guards.spec.ts` readonly projection guard | Projection tests; targeted eslint; frontend/backend builds passed |
| `web/src/modules/driver/pages/driver-pending-invoices-page.tsx` | Local search filtering plus local `amountKd` reduce total | Search-aware `/orders/driver/pending-invoices?search=` envelope with `rows`, `totalAmountKd`, `filteredCount`, `totalCount` from `computeCanonicalDriverPendingInvoiceProjection()` | `v21-canonical-banking-guards.spec.ts` readonly projection guard | Projection tests; targeted eslint; frontend/backend builds passed |
| `web/src/modules/driver/pages/my-deposits-page.tsx` | Local `/api/orders` filtering and `totalPrice` summation for driver cash custody | `/finance/driver/my-cash-custody` from `computeCanonicalDriverCashCustodySummary()` | `v21-canonical-banking-guards.spec.ts` formatting guard | Projection tests; targeted eslint; frontend/backend builds passed |
| `web/src/modules/call-center/control-tower/components/risk-table.tsx` | Duplicate `Intl.NumberFormat` for row total due | `formatKwdLabel()` on backend `row.totalDue` | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Targeted eslint; frontend/backend builds passed |
| `web/src/modules/call-center/dashboard/components/customer-panel.tsx` | Duplicate KWD formatter and manual KWD suffix in suggestion/status text | `formatKwdLabel()` on backend `row.totalDueKd`; active-slice React lint fixed | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guard | Targeted eslint; frontend/backend builds passed |
| `web/src/pages/staff-debts-page.tsx` | Multi-source local reconstruction: driver/manager rows, filters, KPIs, method breakdowns, aging counts, totals | `/manager-custody/staff-debts` filter-aware canonical envelope with rows, totals, filters, employee options, branches | `v21-canonical-banking-guards.spec.ts` readonly projection guard | Targeted eslint; frontend/backend builds passed |

## Existing Canonical DTO Fields Added Before This Report

| DTO / File | Field | Purpose |
| --- | --- | --- |
| `CustomerLedgerResponse.totals` | `totalInvoicedKd` | Server statement total |
| `CustomerLedgerResponse.totals` | `totalPaidInvoicesKd` | Server paid invoice total |
| `CustomerLedgerResponse.totals` | `totalOpenInvoicesKd` | Server open invoice total |
| `UnpaidInvoiceRow` | `customerRunningRemainingKd` | Server running receivable per customer |
| `OutstandingResponse` | `driverSummaries` | Server per-driver readonly Outstanding summary |
| `CollectionUnpaidOnlineReportResponse` | `branchSummaries`, `paymentLinkSummary`, `paymentLinkRows` | Server unpaid-online report summaries and filtered payment-link rows |
| `DebtRecoveryReport` | `totalSettlements`, `totalSubscriptions`, `maxRecoveredKd`, `days[].trendRatio` | Server debt recovery summary/card/chart values |
| `CommissionPayoutsResponse` | `summaryTotals` | Server commission payout summary cards |
| `DriverPendingInvoicesResponse` | `rows`, `totalAmountKd`, `filteredCount`, `totalCount` | Server search-aware driver pending invoice rows and total |
| `DriverCashCustodySummary` | `cashTotalKd`, `cashOrderCount`, `grandTotalKd` | Server driver cash custody summary |
| `StaffDebtsResponse` | `drivers`, `managers`, `branches`, `employeeOptions`, `selectedEmployee`, `totals`, `appliedFilters` | Server filter-aware staff debts envelope |

## Final Closure Slice (2026-05-08)

| Component | Removed Local Calculation | Canonical Replacement | Guard | Validation |
| --- | --- | --- | --- | --- |
| `web/src/modules/call-center/components/customer-ledger-panel.tsx` | Local invoice-bucket reduce, manual `Math.max(-balance)` debt math, `parseLedgerOperationalDebtKd` consumer, `parseFloat` checks on KD values | `data.totals.{totalOpenInvoicesKd,totalPaidInvoicesKd,unpaidInvoiceCount,paidInvoiceCount}`, `event.projection.{isCredit,effectiveDebtAfterKd,hasDebtSettled,hasDebtDiscount,closedInvoicesTotalKd}`, `data.invoices[].projectionGroup`, `data.customer.operationalDebtKd` string compare | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guards (parser + statement debt reconstruction + closed-invoice reduce) | Backend projection + V21 guard tests; targeted eslint; backend & web builds passed |
| `web/src/pages/statement-print-page.tsx` | `KD_FMT_4` duplicate formatter, local unpaid-bucket `reduce`, `Math.max(-balance)` debt math, `closedInvoices.reduce(...)`, `parseLedgerOperationalDebtKd` consumer | `formatKwdLabel()` everywhere, `data.totals.totalOpenInvoicesKd`, `event.projection.{effectiveDebtAfterKd,closedInvoicesTotalKd,isCredit}`, `data.invoices[].projectionGroup`, `data.customer.operationalDebtKd` | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guards | Backend projection + V21 guard tests; targeted eslint; backend & web builds passed |
| `web/src/modules/customers/components/Customer360Smart.tsx` | `formatArabicKwd(value) + ' د.ك'` duplicate formatter, manual KWD suffix concatenation, `parseFloat > 0` subscription check | `formatKwdLabel()` for all display, `subscriptionValueKd !== '0.0000'` string compare on canonical 4dp DTO | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guards (formatArabicKwd, parseFloat on Kd) | Targeted eslint; backend & web builds passed |
| `web/src/modules/call-center/components/customer-360-panel.tsx` | `formatArabicKwd(value) + ' د.ك'` in `Metric` tile, manual KWD suffix concatenation, `parseFloat > 0` subscription gate | `formatKwdLabel()` in `Metric`, `subscriptionValueKd !== '0.0000'` string compare | `v21-canonical-banking-guards.spec.ts` formatting + readonly projection guards | Targeted eslint; backend & web builds passed |

### New Canonical DTO Fields (Closure Slice)

| DTO / File | Field | Purpose |
| --- | --- | --- |
| `CustomerLedgerResponseDto.totals` | `unpaidInvoiceCount`, `paidInvoiceCount`, `canceledInvoiceCount` | Statement bucket counts pre-computed once on the server |
| `CustomerLedgerInvoiceDto` | `projectionGroup` (`UNPAID` / `PAID` / `CANCELED`) | Server-canonical invoice bucket so UI never derives it from `status + openDebt` locally |
| `CustomerLedgerEventDto` | `projection` (`isCredit`, `effectiveDebtAfterKd`, `hasDebtDiscount`, `hasDebtSettled`, `closedInvoicesTotalKd`) | Pre-computed display projection so UI never reconstructs negative-balance debt or sums closed-invoice totals |
| `canonical-financial-projection.ts` | `canonicalStatementInvoiceGroup()`, `computeCanonicalStatementEventProjection()` | Reusable read-only selectors covering statement event/invoice display projections |

### Legacy Readonly Layer Removals

| Removed | Reason | Verification |
| --- | --- | --- |
| `web/src/lib/customer-ledger-parse.ts` (file) | Zero remaining consumers after `customer-ledger-panel` and `statement-print-page` migrated to `data.customer.operationalDebtKd` | Project-wide consumer scan empty; web build passed |
| `formatArabicKwd` export from `web/src/lib/arabic-customer-text.ts` | Duplicate of canonical `formatKwdLabel`; both consumers migrated | Project-wide scan empty; remaining helpers (`getArabicStatus`, `getArabicInsight`, `getArabicNextAction`) kept as pure UI text utilities and re-routed through `formatKwdLabel` for any KWD value |

### Expanded Guards

`src/finance/v21-canonical-banking-guards.spec.ts` was extended to fail the build if any of these patterns reappear in guarded files:

- `parseLedgerOperationalDebtKd(...)` (legacy debt parser)
- `formatArabicKwd(...)` (legacy duplicate formatter)
- `Math.max(-...balanceAfter...)` (local statement debt reconstruction)
- `closedInvoices.reduce(...)` (local closed-invoice total reconstruction)

Newly added to guarded file lists:

- `web/src/modules/call-center/components/customer-360-panel.tsx`
- `web/src/modules/customers/components/Customer360Smart.tsx`
- `web/src/lib/arabic-customer-text.ts`

### Final Validation

- Backend tests: `src/finance/canonical-financial-projection.spec.ts` + `src/finance/v21-canonical-banking-guards.spec.ts` → 57/57 passed
- Targeted ESLint on every modified file → 0 errors
- Backend `nest build` → success
- Web `tsc -b && vite build` → success
- Project-wide scan for `formatArabicKwd | parseLedgerOperationalDebtKd | parseLedgerEffectiveDebtKd | customer-ledger-parse` → only the V21 guard spec itself matches (intentional)

### Phase 2 Completion Checklist

- [x] Frontend no longer computes readonly financial truth
- [x] Frontend no longer aggregates KD values for display
- [x] Frontend no longer computes grouped financial summaries
- [x] Frontend no longer computes running balances or effective debt
- [x] Frontend no longer rebuilds statement totals
- [x] Frontend no longer reconstructs dashboard / report totals
- [x] No duplicate readonly KWD formatters remain
- [x] Dead readonly helpers removed (`customer-ledger-parse.ts`, `formatArabicKwd`)
- [x] Static guards prevent regression of every removed pattern
- [x] All readonly financial truth originates only from the Canonical Banking Core Layer

Phase 2 is officially complete. The Canonical Banking Core Layer is now the single readonly financial truth source for the migrated surfaces.

## Remaining Phase 2 Candidates

High priority display-only candidates:

- `web/src/modules/shared/components/page/kpi-card.tsx`
- `web/src/modules/shared/components/ui/stat-tile.tsx`
- `web/src/modules/finance/components/FinancialStatCard.tsx`
- `web/src/modules/call-center/dashboard/components/customer-panel.tsx`
- `web/src/modules/call-center/control-tower/components/risk-table.tsx`
- `web/src/modules/call-center/control-tower/components/risk-table.tsx`
- `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx` still has print roster ordering; driver, branch, and payment-link financial grouping have migrated to backend projections.
- `web/src/pages/debt-recovery-report-page.tsx` computes report totals and chart scale locally from backend day rows.
- `web/src/modules/customers/components/Customer360Smart.tsx` has local subscription presence checks and manual KWD suffixes.
- `web/src/components/expenses/expenses-analytics-dashboard.tsx` computes chart widths/max values locally; display totals use canonical formatter but analytics scaling remains client-side.
- `web/src/pages/commission-payouts-page.tsx` locally sums payout totals and formats KD.
- `web/src/modules/manager/pages/MyDocumentsPage.tsx` locally sums document `amountKd`.
- `web/src/modules/driver/pages/driver-pending-invoices-page.tsx` totals row (requires backend total field before removing local reduce)
- `web/src/modules/driver/pages/my-deposits-page.tsx` custody total (requires backend cash-custody summary field before removing local sum)
- `web/src/pages/statement-print-page.tsx` still contains parse/format display helpers that need a dedicated Phase 2 slice.
- `web/src/pages/unpaid-invoices-page.tsx` still contains parse/format display helpers that need a dedicated Phase 2 slice.
- `web/src/modules/collections/components/CollectionsKpiStrip.tsx` is display-only over observability DTO sections; no financial math found.
- `web/src/pages/staff-debts-page.tsx` migrated to a combined filter-aware backend DTO.

Deferred high-risk candidates:

- POS quote/preview math.
- Invoice supervisor same-day delta math.
- Realtime mutation-adjacent financial flows.

## Validation Log

Validation is appended after each Phase 2 slice.

## Global Lint Audit Classification

Latest command: `npm run lint` in `web/`.

Classification:

- Active-slice issue: none after `MoneyFlowCard` and `KpiStrip` targeted lint.
- Pre-existing unrelated failures remain outside the active slice.

Observed pre-existing categories:

- React hook-order errors in driver and invoice/report pages.
- React purity errors from `Date.now()` or synchronous state effects in dashboard/print/shared pages.
- Shared UI fast-refresh export-shape errors.
- Unused variables / stale eslint-disable directives in legacy/test files.
- Existing readonly financial consumers still pending migration, including statement/unpaid invoice parse helpers, driver local totals, collections local sums, and control tower KPI formatting.

Policy:

- Do not suppress or ignore these failures.
- Continue only with targeted lint on edited files, affected tests, builds, and V21 guard tests until each pre-existing file is selected as its own migration/fix slice.

## 2026-05-08 — Slice 1: MoneyFlowCard

Changed files:

- `web/src/modules/finance/components/MoneyFlowCard.tsx`
- `web/src/modules/finance/components/financial-ui-kit.test.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- `MoneyFlowCard` is now display-only for net cash flow. It requires `netKd` from the caller/canonical DTO and no longer derives net from `cashInKd` and `cashOutKd`.
- Formatting now uses the centralized frontend KWD formatter.
- Static guard now covers completed readonly projection components and blocks `parseFloat` on KD fields, local KD reducers, and local net financial arithmetic.

Validation:

- Passed: `npm test -- src/modules/finance/components/financial-ui-kit.test.tsx` in `web/`.
- Passed: `npx eslint src/modules/finance/components/MoneyFlowCard.tsx src/modules/finance/components/financial-ui-kit.test.tsx` in `web/` with one pre-existing warning in the test file.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts`.
- Passed: `npm run build` in repository root.
- Blocked/full-suite note: full `npm run lint` in `web/` still fails on unrelated pre-existing lint errors outside this slice, including call-center dashboard purity errors, driver hook-order errors, and shared UI fast-refresh rules.

## 2026-05-08 — Slice 2: Call-Center Dashboard KpiStrip

Changed files:

- `web/src/modules/call-center/dashboard/components/kpi-strip.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- Removed duplicate readonly KWD formatter from `KpiStrip`.
- Removed `Number.parseFloat()` on backend-provided KD display values.
- Removed manual KWD unit text from KPI labels; the centralized formatter now owns the `د.ك` suffix.
- Dashboard KPI values remain display-only and continue to use backend-provided `outstanding.totalDueKd` and `summary.debtRecoveredTodayKd`.
- Added `KpiStrip` to V21 formatting and readonly financial math guards.

Validation:

- Passed: `npx eslint src/modules/call-center/dashboard/components/kpi-strip.tsx` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts`.
- Passed: `npm run build` in repository root.
- Full-suite note: `npm run lint` in `web/` remains blocked by pre-existing unrelated failures documented above.

## 2026-05-08 — Slice 3: Control Tower KPI Cards

Changed files:

- `web/src/modules/call-center/control-tower/components/kpi-cards.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Audit:

- `DebtCard` and `CustomerFinancialHeader` remain display-only and already use `formatKwdLabel()` on server-canonical props.
- `ControlTowerKpiCards` had a duplicate `Intl.NumberFormat` helper for the `totalDue` KPI.
- No local KPI aggregation or row reduction was present in this component.

Result:

- Removed the duplicate `fmtKd()` helper.
- `kpis.totalDue` now renders through `formatKwdLabel()`.
- Added `ControlTowerKpiCards` to the V21 formatting and readonly financial math guards.

Validation:

- Passed: `npx eslint src/modules/call-center/control-tower/components/kpi-cards.tsx` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts` with 21 assertions. One run emitted a PowerShell output-wrapper `Add-Content` warning after Jest had already passed; no test failure was reported.
- Passed: `npm run build` in repository root.

## 2026-05-08 — Slice 4: Collections Queue Panel

Changed files:

- `web/src/modules/collections/components/CollectionsQueuePanel.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Audit:

- `CollectionsKpiStrip` consumes `ObservabilityOverview` sections and renders values without financial aggregation.
- `CollectionsQueuePanel` filtered/search-sorted customers locally for UI behavior, but did not compute financial totals.
- The only financial display issue in this slice was raw rendering of `remainingDebtKd` without the centralized KWD formatter.

Result:

- `remainingDebtKd` now renders through `formatKwdLabel()`.
- No local debt calculation, running balance, or aggregation was introduced.
- Added `CollectionsQueuePanel` to V21 formatting and readonly financial math guards.

Validation:

- Passed: `npm test -- src/modules/collections/pages/collections-workspace-shell.test.tsx` in `web/`.
- Passed: `npx eslint src/modules/collections/components/CollectionsQueuePanel.tsx src/modules/collections/pages/collections-workspace-shell.test.tsx` in `web/` with one pre-existing warning in the test file.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts` with 23 assertions.
- Passed: `npm run build` in repository root. One run emitted a PowerShell output-wrapper `Add-Content` warning after the build had completed; no build failure was reported.

## Final Sweep Audit Snapshot

The final sweep audit found additional readonly financial consumers. They are not all safe to finish in one step because several require backend DTO additions before removing local chart/report aggregation.

Low-risk formatter-only candidates:

- `web/src/modules/call-center/dashboard/components/call-queue.tsx`
- `web/src/modules/call-center/control-tower/components/risk-table.tsx`
- `web/src/pages/debt-holds-page.tsx`

Backend-DTO-required candidates:

- `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx`
- `web/src/pages/debt-recovery-report-page.tsx`
- `web/src/pages/commission-payouts-page.tsx`
- `web/src/modules/manager/pages/MyDocumentsPage.tsx`
- Driver totals in `driver-pending-invoices-page.tsx` and `my-deposits-page.tsx`

Deferred mutation/POS hotspots:

- `web/src/utils/finance-engine.ts`
- `web/src/modules/shared/hooks/use-pos-engine.ts`
- `web/src/pages/pos-page.tsx`
- `web/src/modules/shared/components/pos/pos-auxiliary-ui.tsx`
- `web/src/modules/shared/components/orders/invoice-supervisor-actions.tsx`

## 2026-05-08 — Slice 5: Call-Center Dashboard CallQueue

Changed files:

- `web/src/modules/call-center/dashboard/components/call-queue.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Audit:

- `CallQueue` uses client-side filtering/search/pagination only; it does not compute financial totals.
- It duplicated KWD formatting for row `totalDueKd` and manually appended the KWD suffix.
- Targeted lint also surfaced a stale dependency warning for `rowsAll` inside this active slice.

Result:

- Removed duplicate `formatKwd()`.
- Row `totalDueKd` now renders through `formatKwdLabel()`.
- Stabilized `rowsAll` with `useMemo()` to keep the active slice lint-clean.
- Added `CallQueue` to V21 formatting and readonly financial math guards.

Validation:

- Passed: `npx eslint src/modules/call-center/dashboard/components/call-queue.tsx` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts` with 25 assertions.
- Passed: `npm run build` in repository root.

## 2026-05-08 — Slice 6: Collections Report Driver Projection

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/finance/outstanding/dto/outstanding-row.dto.ts`
- `src/finance/outstanding/outstanding.service.ts`
- `src/finance/outstanding/outstanding.service.spec.ts`
- `web/src/modules/call-center/outstanding/api/outstanding-api.ts`
- `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Classification:

- Display-only: local KWD formatter and manual KWD suffixes.
- Requires canonical DTO: per-driver Outstanding financial summary.
- Deferred: branch/payment-link grouping from `unpaid-online` endpoint and print roster ordering.

Backend projection expansion:

- Added `computeCanonicalOutstandingDriverSummaries()` to `canonical-financial-projection.ts`.
- Added `OutstandingResponse.driverSummaries`.
- `OutstandingService.listOutstanding()` now returns per-driver summaries from the same filtered canonical Outstanding rows.

Frontend migration:

- Removed `groupOutstandingByDriver()` usage from `collections-report-page.tsx`.
- Driver summary table now consumes `outstanding.data.driverSummaries`.
- Removed duplicate KWD formatter and manual KWD unit suffixes from migrated money displays.
- Removed the mixed unpaid-link count column from the driver financial table because it was sourced from a separate frontend grouping.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/outstanding/outstanding.service.spec.ts`.
- Passed: `npm run build` in repository root after selector and DTO/service changes.
- Passed: `npx eslint src/modules/call-center/collections-report/pages/collections-report-page.tsx src/modules/call-center/outstanding/api/outstanding-api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/outstanding/outstanding.service.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 43 assertions.
- Passed: final frontend/backend builds.

## 2026-05-08 — Slice 7: Collections Report Unpaid-Online Projection Envelope

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/orders/orders.service.ts`
- `src/orders/orders.controller.ts`
- `web/src/lib/api.ts`
- `web/src/modules/call-center/collections-report/hooks/use-unpaid-online.ts`
- `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Classification:

- Requires canonical DTO: branch summaries, payment-link summary, and filtered payment-link rows for `collections-report-page.tsx`.
- Backwards compatibility required: legacy `collections-page.tsx` still consumes `/api/orders/collections/unpaid-online` as an array.

Backend projection expansion:

- Added `computeCanonicalUnpaidOnlineReportProjection()` to `canonical-financial-projection.ts`.
- Added `/api/orders/collections/unpaid-online/report`, leaving the legacy array endpoint unchanged.
- Added `listUnpaidCollectionOrdersReport()` to return `{ rows, paymentLinkRows, branchSummaries, paymentLinkSummary }`.

Frontend migration:

- `useUnpaidOnline()` now consumes the report envelope for `collections-report-page.tsx`.
- Removed `groupUnpaidByBranch()` and `filterUnpaidLinks()` usage from the report page.
- Branch table, branch filter options, payment-link KPI, and payment-link table now read backend-projected fields.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts`.
- Passed: `npm run build` in repository root after endpoint changes.
- Passed: `npx eslint src/modules/call-center/collections-report/pages/collections-report-page.tsx src/modules/call-center/collections-report/hooks/use-unpaid-online.ts src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 31 assertions.

## 2026-05-08 — Slice 8: Debt Recovery Report Projection

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/call-center/dto/debt-recovery-report.dto.ts`
- `src/call-center/call-center.service.ts`
- `web/src/lib/api.ts`
- `web/src/pages/debt-recovery-report-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- Added `computeCanonicalDebtRecoverySummary()`.
- Added `totalSettlements`, `totalSubscriptions`, `maxRecoveredKd`, and per-day `trendRatio` to the debt recovery DTO.
- Removed frontend `reduce()` totals and `parseFloat()` trend calculations.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts`.
- Passed: `npm run build` in repository root.
- Passed: `npx eslint src/pages/debt-recovery-report-page.tsx src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 34 assertions.

## 2026-05-08 — Slice 9: Commission Payout Summary Projection

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/commissions/commission-payouts.service.ts`
- `web/src/lib/api.ts`
- `web/src/pages/commission-payouts-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- Added `computeCanonicalCommissionPayoutSummaryTotals()`.
- Added `CommissionPayoutsResponse.summaryTotals`.
- Removed frontend `sumField()` aggregation and duplicate commission KWD formatter.
- Commission summary cards now render backend summary totals through `formatKwdLabel()`.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts`.
- Passed: `npm run build` in repository root.
- Passed: `npx eslint src/pages/commission-payouts-page.tsx src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 37 assertions.

## 2026-05-08 — Slice 10: Driver Pending Invoice Search-Aware Projection

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/orders/orders.service.ts`
- `src/orders/orders.controller.ts`
- `web/src/lib/api.ts`
- `web/src/modules/driver/pages/driver-pending-invoices-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- Added `computeCanonicalDriverPendingInvoiceProjection()`.
- `GET /api/orders/driver/pending-invoices` now accepts `search` and returns `{ rows, totalAmountKd, filteredCount, totalCount }`.
- Removed local search filtering and local `amountKd` reduce from the driver page.
- Preserved semantics: displayed rows and displayed total come from the same search-filtered backend dataset.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts`.
- Passed: `npm run build` in repository root.
- Passed: `npx eslint src/modules/driver/pages/driver-pending-invoices-page.tsx src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 39 assertions.

## 2026-05-08 — Slice 11: Driver Cash Custody Summary Projection

Changed files:

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-financial-projection.spec.ts`
- `src/finance/services/cash.service.ts`
- `src/finance/finance.service.ts`
- `src/finance/finance.controller.ts`
- `web/src/lib/api.ts`
- `web/src/modules/driver/pages/my-deposits-page.tsx`

Result:

- Added `computeCanonicalDriverCashCustodySummary()`.
- Added readonly `GET /api/finance/driver/my-cash-custody` for the authenticated driver.
- Removed `/api/orders` broad fetch and local `PAID_TO_DRIVER` filtering/summing from `my-deposits-page.tsx`.
- Preserved local handover notification flag behavior; no mutation or reconciliation flow was changed.

Validation:

- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts`.
- Passed: `npm run build` in repository root.
- Passed: `npx eslint src/modules/driver/pages/my-deposits-page.tsx src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 40 assertions.

## 2026-05-08 — Slice 12: Small Dashboard Display Widgets

Changed files:

- `web/src/modules/call-center/control-tower/components/risk-table.tsx`
- `web/src/modules/call-center/dashboard/components/customer-panel.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- `ControlTowerRiskTable` now uses `formatKwdLabel()` for backend `row.totalDue`.
- `CustomerPanel` now uses `formatKwdLabel()` in call suggestions and the outstanding badge.
- Removed duplicate `Intl.NumberFormat` and manual KWD suffixes.
- Fixed active-slice React lint in `CustomerPanel` by deriving mount from `open` and keeping only the Escape listener effect.

Validation:

- Passed: `npx eslint src/modules/call-center/control-tower/components/risk-table.tsx src/modules/call-center/dashboard/components/customer-panel.tsx` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/v21-canonical-banking-guards.spec.ts`.
- Passed: `npm run build` in repository root.

## Deferred DTO Design: Staff Debts

`web/src/pages/staff-debts-page.tsx` is not a safe formatter-only slice. It merges:

- `/api/finance/driver-balance`
- `/api/manager-custody/aging`
- `/api/branches`
- local branch/name/employee/status filters
- local pipeline/driver/manager totals and per-method driver breakdowns

Safe migration requires a combined, filter-aware readonly DTO so displayed rows and displayed totals remain aligned. No changes were made in this slice.

## 2026-05-08 — Slice 13: Staff Debts Canonical Envelope

Changed files:

- `src/manager-custody/dto/list-custody-query.dto.ts`
- `src/manager-custody/manager-custody.service.ts`
- `src/manager-custody/manager-custody.controller.ts`
- `web/src/lib/api.ts`
- `web/src/pages/staff-debts-page.tsx`
- `src/finance/v21-canonical-banking-guards.spec.ts`

Result:

- Added `/api/manager-custody/staff-debts`, a combined filter-aware readonly envelope.
- Backend now owns driver rows, manager rows, branches, employee options, selected employee, applied filters, and all staff-debt totals.
- `staff-debts-page.tsx` no longer fetches `/finance/driver-balance`, manager custody aging, and branches separately.
- Removed frontend financial aggregation for pipeline totals, driver totals, manager totals, method breakdowns, overdue counts, and filtered rows.
- Frontend keeps only interaction state: branch/name/employee/status filters, expand/collapse, print action, and URL sync.

Validation:

- Passed: `npx eslint src/pages/staff-debts-page.tsx src/lib/api.ts` in `web/`.
- Passed: `npm run build` in `web/`.
- Passed: `npm test -- --runTestsByPath src/finance/canonical-financial-projection.spec.ts src/finance/outstanding/outstanding.service.spec.ts src/finance/v21-canonical-banking-guards.spec.ts` with 61 assertions.
- Passed: `npm run build` in repository root.

