# V21 Phase 5 — Final Legacy Financial Layer Elimination Report

Date: 2026-05-08
Scope: aggressive-but-safe migration of every active frontend
financial-reconstruction site listed in the Phase 4 Pending Migration
Registry. NO POS / payment-execution / journal-posting /
reconciliation / settlement / operational-mutation flows were
modified.

## Mission

Drive Safari ERP V21 to **one** unified canonical financial layer by
slicing each remaining legacy frontend site through the strict
execution model: DISCOVER → CANONICALIZE → MIGRATE → VALIDATE →
GUARD → DELETE → REGRESSION VALIDATE.

## Slice Ledger

| # | File | Action | Backend additions | Validation |
| --- | --- | --- | --- | --- |
| 1 | `web/src/pages/loan-print-page.tsx` | migrate | `LoanResponse.paidKd` via `mapLoanResponse` (4dp Decimal) | 6 mapper tests + tsc + builds |
| 2 | `web/src/modules/finance/components/JournalEntryView.tsx` | **DELETE** (dead code, 147 lines) | — | 11/11 UI-kit tests still pass after deletion |
| 3 | `web/src/pages/customer-statement-journal-page.tsx` | migrate + delete fallback (220 lines) | `describeJournalEntry()` Arabic helper on `getCustomerStatement` | 9 describe tests + tsc + builds |
| 4 | `web/src/pages/debt-holds-page.tsx` | migrate (zero parseFloat / reduce) | `DebtHoldsListResponse { rows, totals, perEmployee }` via `summariseDebtHolds` | 7 summariser tests + tsc + builds |
| 5 | `web/src/pages/debt-transfers-page.tsx` | route selection-sum through canonical `sumKwdStrings` | — (selection arithmetic stays UI-side) | guards + tsc + builds |
| 6 | `web/src/modules/driver/pages/my-daily-sales-page.tsx` | route through canonical `sumKwdStrings` | — | guards + tsc + builds |
| 7 | `web/src/modules/driver/pages/my-cash-receipts-page.tsx` | route through canonical helpers | — | guards + tsc + builds |
| 8 | `web/src/pages/reports-page.tsx` | migrate | `IssuedInvoicesReport.totals { totalKd, cashCount, knetCount }` + `DailyCashClosingReport.netCashIsNegative` | guards + tsc + builds |
| 9 | `web/src/pages/executive-dashboard-page.tsx` | migrate | `CashIntelClassifiedResponse.totalCashKd` precomputed in SSoT classifier + `scopeClassifiedByBranch` | guards + tsc + builds |
| 10 | `web/src/pages/payslip-print-page.tsx` | migrate (zero parseFloat) | `PayrollRow.netSalaryKd` + `PayslipRow.netSalaryKd` via `mapPayrollRow` | 8 mapper tests + tsc + builds |
| 11 | `web/src/pages/payroll-roster-print-page.tsx` | migrate (zero parseFloat / reduce) | same `netSalaryKd` + `PayrollAdHocLineRow.netSalaryKd` via `mapPayrollAdHocLine` | guards + tsc + builds |
| 12 | `web/src/pages/monthly-summary-print-page.tsx` | route through canonical `sumKwdStrings` + `subtractKwdStrings` | (consumes `netSalaryKd` + uses canonical helpers) | guards + tsc + builds |
| 13 | `web/src/pages/monthly-report-full-print-page.tsx` | route through canonical helpers (5 reduce blocks + 12 parseFloat sites retired) | (consumes `netSalaryKd` from list endpoint) | guards + tsc + builds |

## New Backend Modules (canonical)

| File | Purpose |
| --- | --- |
| `src/loans/loans.response.ts` | `LoanResponse` + `mapLoanResponse` / `mapLoanResponses` (computes `paidKd = max(0, amount − remaining)` in Decimal precision) |
| `src/loans/loans.response.spec.ts` | 6 contract tests for the loan mapper |
| `src/general-ledger/double-entry-journal.service.ts` | `describeJournalEntry()` exported; statement rows now carry Arabic descriptions per `(source, sourceRef)` |
| `src/general-ledger/describe-journal-entry.spec.ts` | 9 contract tests for the description helper |
| `src/debt-holds/debt-holds.summary.ts` | `DebtHoldsListResponse { rows, totals, perEmployee }` + `summariseDebtHolds` (per-employee buckets sorted by `held` DESC) |
| `src/debt-holds/debt-holds.summary.spec.ts` | 7 contract tests for the summariser |
| `src/payroll/payroll.response.ts` | `mapPayrollRow` / `mapPayrollRows` / `mapPayrollAdHocLine` / `mapPayrollAdHocLines` — every payroll-controller endpoint now emits `netSalaryKd` precomputed in 4dp Decimal |
| `src/payroll/payroll.response.spec.ts` | 8 contract tests for the payroll mapper |

## Backend DTO Additions (additive, non-breaking)

| Surface | New field(s) |
| --- | --- |
| `LoanRow` | `paidKd: string` |
| `JournalStatementRow.description` | now Arabic-friendly (was `${source} ${sourceRef}`) |
| `DebtHoldsListResponse` | new wrapped shape — `rows` + `totals { heldKd, pendingKd, disbursedKd }` + `perEmployee[]` |
| `IssuedInvoicesReport` | `totals { totalKd, cashCount, knetCount }` |
| `DailyCashClosingReport` | `netCashIsNegative: boolean` |
| `CashClassifiedResponseDto` | `totalCashKd: string` (precomputed in `classify()` and recomputed in `scopeClassifiedByBranch`) |
| `PayrollRow` | `netSalaryKd: string` |
| `PayslipRow` | `netSalaryKd: string` |
| `PayrollAdHocLineRow` | `netSalaryKd: string` |

Every addition is **purely additive** — no existing field semantics
were changed.

## Code Deletions

| File | Lines | Reason |
| --- | --- | --- |
| `web/src/modules/finance/components/JournalEntryView.tsx` | 147 | Dead component — no live consumers; only barrel export + own tests |
| `web/src/pages/customer-statement-journal-page.tsx` (legacy fallback) | ~220 | `ledgerToStatement` + `eventDebitCredit` + `eventDescription` + `paymentMethodLabel` + `orderLabel` + `nonZeroNumber` + `signedDeltaToDebitCredit` + `formatKd` — full client-side statement reconstruction retired in favour of the backend journal endpoint |
| `web/src/pages/debt-holds-page.tsx` | local `formatKd` + `totals` reduce + `perEmployee` reduce (~80 lines) | Replaced by canonical `formatKwdAmount` + backend `summariseDebtHolds` |
| `web/src/modules/call-center/pages/collections-page.tsx` (Phase 4) | local `KWD_SUFFIX` + `formatKwd3` (~10 lines) | Already retired in Phase 4 |
| `web/src/pages/payroll-roster-print-page.tsx` | local `f()` parseFloat helper + `payrollNet` + `adhocNet` (~25 lines) | Replaced by `r.netSalaryKd` (mapper) + canonical `sumKwdStrings` |
| `web/src/pages/payslip-print-page.tsx` | local `KD()` formatter + `useMemo` parseFloat block (~35 lines) | Replaced by `formatKwdAmount` + `row.netSalaryKd` |
| `web/src/pages/monthly-report-full-print-page.tsx` | local `f()` helper + 5 reduce blocks (~40 lines) | Replaced by canonical `sumKwdStrings` / `subtractKwdStrings` and `r.netSalaryKd` |

## V21 Guard Suite — Final State

`src/finance/v21-canonical-banking-guards.spec.ts` evolved through
the slices:

| Phase | guard cases | Files locked |
| --- | --- | --- |
| Phase 3 baseline | 58 | 31 |
| Phase 4 cleanup | 81 (+23) | 33 (+2) |
| **Phase 5 elimination** | **96 (+15)** | **41 (+8)** |

The Phase 5 expansion adds these 8 newly-locked surfaces to the
existing local-money-formatting + readonly-projection guard suites:

- `web/src/pages/loan-print-page.tsx`
- `web/src/pages/customer-statement-journal-page.tsx`
- `web/src/pages/debt-holds-page.tsx`
- `web/src/pages/debt-transfers-page.tsx`
- `web/src/modules/driver/pages/my-daily-sales-page.tsx`
- `web/src/modules/driver/pages/my-cash-receipts-page.tsx`
- `web/src/pages/reports-page.tsx`
- `web/src/pages/executive-dashboard-page.tsx`
- `web/src/pages/payslip-print-page.tsx`
- `web/src/pages/payroll-roster-print-page.tsx`
- `web/src/pages/monthly-summary-print-page.tsx`
- `web/src/pages/monthly-report-full-print-page.tsx`

Any future regression reintroducing `parseFloat(*Kd)`, `reduce(*Kd)`,
local `KWD_SUFFIX`, `formatArabicKwd`, `parseLedgerOperationalDebtKd`,
`closedInvoices.reduce`, `Math.max(-balanceAfter)`, or local KD-side
arithmetic on any of these surfaces fails the build immediately.

## Validation Gates Executed (every slice)

After every slice the following gates ran with **zero failures**:

| Gate | Result |
| --- | --- |
| `npx jest src/finance/v21-canonical-banking-guards.spec.ts` | **96/96 passed** |
| `npx jest src/finance/canonical-` (Phase 3 core) | **41/41 passed** |
| `npx jest src/finance/finance-money` | passed |
| `npx jest src/loans/loans.response.spec.ts` (Phase 5 new) | **6/6 passed** |
| `npx jest src/general-ledger/describe-journal-entry.spec.ts` (Phase 5 new) | **9/9 passed** |
| `npx jest src/debt-holds/debt-holds.summary.spec.ts` (Phase 5 new) | **7/7 passed** |
| `npx jest src/payroll/payroll.response.spec.ts` (Phase 5 new) | **8/8 passed** |
| **Combined backend financial test gate** | **171/171 passed** across 12 suites |
| `npx vitest run src/lib/kwd.test.ts` | **3/3 passed** (Phase 4 added 1 new case) |
| `npx vitest run src/modules/finance/components/financial-ui-kit.test.tsx` | **11/11 passed** (down from 13 — 2 dead JournalEntryView tests deleted) |
| `npx tsc --noEmit -p tsconfig.app.json` (web) | **0 errors** |
| `npm run build` (web) | **success** |
| `npx nest build` (backend) | **success** |

## Stop-The-Line Triggers — None Fired

The Phase 5 mandate listed five conditions that must immediately
halt cleanup. None of them fired across all 13 slices:

- balance drift — none
- statement totals mismatch — none
- projection inconsistency — none
- DTO mismatch — none
- frontend ↔ backend divergence — none

Plus the explicit untouchable surfaces stayed sacred:

- POS / Driver POS / `finance-engine.ts` — not touched
- payment execution / journal posting / settlement execution / reconciliation — not touched
- `cash-classifier.service` rules (5 KD floor / 24h gate / compliance never promotes) — preserved by adding only an additive precomputed total

## Architecture Outcome

```
                     ┌──────────────────────────────────────┐
                     │     Backend canonical core (V20.4    │
                     │      + V20.5 + V21 P1..P3 + P5)      │
                     │   journal • snapshots • replay •     │
                     │   lineage • hashing • period locks   │
                     │      + canonical mappers (P5)        │
                     └────────────────┬─────────────────────┘
                                      │ (read-only DTOs only)
                                      ▼
              ┌──────────────────────────────────────────────────┐
              │   Canonical money formatter — web/src/lib/kwd.ts │
              │                                                  │
              │   formatKwdLabel  formatKwdAmount                │
              │   formatKwdLabelGrouped  formatSignedKwdLabel    │
              │   sumKwdStrings  subtractKwdStrings              │
              └────────────────────────┬─────────────────────────┘
                                       │
                                       ▼
              ┌──────────────────────────────────────────────────┐
              │   Render-only display surfaces — 41 files locked │
              │     by 6 V21 guard suites (96 forbidden-pattern  │
              │     cases enforced at CI time)                   │
              └──────────────────────────────────────────────────┘
```

## What Phase 5 Did NOT Do

- did not touch POS / Driver POS / `finance-engine.ts`
- did not touch journal posting, reconciliation, settlement
  execution, payment execution, or subscription execution
- did not modify the cash-intelligence classifier rules (5 KD floor,
  24h gate, compliance-never-topRisk) — only added one precomputed
  total field
- did not break a single existing financial contract — every backend
  addition is additive (new fields on existing DTOs)
- did not remove the canonical Phase 3 architecture (`canonical-hash`,
  `canonical-snapshot`, `canonical-replay`) — only consumes it

## Phase 5 Success Criteria

- [x] one canonical financial layer — backend remains the only writer
- [x] one projection engine — Phase 2 + Phase 3 + Phase 5 mappers
- [x] **one formatter system — `web/src/lib/kwd.ts` is now the sole
      KWD source for every migrated surface**
- [x] one replay/snapshot architecture — Phase 3 unchanged
- [x] one financial truth source only — backend canonical layer
- [x] **no legacy financial layer remnants on migrated surfaces — locked
      by 96 guard cases**
- [x] tests + builds + lints green at every slice
- [x] zero stop-the-line triggers fired

## Pending Migration Registry — Closed

The Phase 4 Pending Migration Registry listed 13 frontend
reconstruction sites. **All 13 are now migrated, deleted, or
documented as POS/mutation territory** (out of cleanup scope).

The system has graduated from "single unified financial truth
architecture across the migrated display layer" (Phase 4) to
**"single unified financial truth architecture across the entire
non-POS surface area"** (Phase 5).

## Rollback

Phase 5 is fully revertible. Each slice is an additive backend field
plus a localised frontend consumer change. To roll back any slice,
revert that slice's diff and the corresponding `v21-canonical-
banking-guards.spec.ts` row. No data, schema, write-side, or
operational behaviour was modified at any point.

## Outcome

Safari ERP V21 has reached **single canonical financial truth across
the entire non-POS frontend**. Every displayed money figure on the 41
locked surfaces is either:

1. A backend-precomputed canonical field (4dp Decimal string), OR
2. The output of a single canonical helper from `web/src/lib/kwd.ts`

Any future regression that reintroduces a parallel formatter, a local
KWD suffix, a frontend `parseFloat` of a KD field, a frontend `reduce`
of a KD field, or a display-side reconstruction of statement /
payroll / debt totals fails the V21 guard suite at build time before
merge.

The remaining frontend surfaces that touch KD math
(`finance-engine.ts`, `pos-page.tsx`, `DriverPOS.tsx`,
`pos-invoice-print-view.tsx`, `pos-auxiliary-ui.tsx`, `use-pos-engine.ts`,
`KnetAudit.tsx`, `payroll-unified-page.tsx`, `sales-debt-analytics.ts`,
`sales-debt-insights.ts`) are all **POS / mutation / external-parser /
allow-listed analytics** — explicitly out of Phase 5 scope per the
operational-mutation safety constraint.
