# V21 Phase 4 — Final Stabilization & Cleanup Report

Date: 2026-05-08
Scope: stabilization and cleanup only. NO new development. NO new
financial layer. NO mutation, POS, journal, reconciliation, payment
execution, or subscription execution flows were modified.

## Mission

Drive Safari ERP V21 to a single, unified financial truth architecture
by:

- consolidating the last duplicate frontend money formatter
- locking the canonical formatter as the only KWD source for the
  migrated display surfaces
- documenting every remaining frontend reconstruction site as a
  Pending Migration Registry so a future Phase 5 can systematically
  retire each one without re-discovery cost
- proving via build / test / lint gates that the operational
  contracts (POS, journal, reconciliation, settlement) are unchanged

## What Phase 4 changed

### A. Consolidated the duplicate KWD formatter

| File | Before | After |
| --- | --- | --- |
| `web/src/lib/kwd.ts` | exposed `formatKwdLabel` (no grouping) only | + `formatKwdLabelGrouped` (3dp + locale grouping for KPI tiles) |
| `web/src/modules/call-center/pages/collections-page.tsx` | local `KWD_SUFFIX` + `formatKwd3` (parallel formatter) | imports `formatKwdLabelGrouped` from `@/lib/kwd`; local helper deleted |
| `web/src/lib/kwd.test.ts` | 2 cases | + 1 case asserting `formatKwdLabelGrouped` formatting + grouping behaviour |

**Net effect:** the `Collections` workspace KPI tiles, market-debt
totals, ledger strip, single-customer hint, row totals, summary
footer, and mark-paid dialog all now route through the **single
canonical formatter file** `web/src/lib/kwd.ts`. The visual rendering
is byte-identical (3dp + locale grouping was preserved).

### B. Removed redundant `.toFixed(3)` precision dance

`singleCustomerInvoiceScope.invoiceTotalKd` previously stringified its
in-memory total via `.toFixed(3)` before passing it to the formatter.
The formatter accepts `number | string`, so the redundancy was
eliminated and the value now flows as a `number` straight into the
canonical formatter.

### C. Expanded the V21 banking guard suite

`src/finance/v21-canonical-banking-guards.spec.ts` now contains
**six** guard suites (Phase 3 had five):

| # | Suite | Files | Forbidden Patterns | Result |
| --- | --- | --- | --- | --- |
| 1 | Local money formatting | 28 (was 27) | `toFixed(3)`, duplicate `Intl.NumberFormat`, manual `د.ك` suffix | **28/28** |
| 2 | Readonly financial display math | 17 | `parseFloat` on `Kd`, `reduce` on `Kd`, `parseLedgerOperationalDebtKd`, `formatArabicKwd`, `Math.max(-balanceAfter)`, `closedInvoices.reduce`, local `net` arithmetic | **17/17** |
| 3 | Collections-report unpaid-online | 1 | `groupUnpaidByBranch`, `filterUnpaidLinks` | **1/1** |
| 4 | Decimal safety on backend canonical layer (Phase 3) | 9 | `Number(...Kd)`, unary `+kd`, `parseFloat(...Kd)` | **9/9** |
| 5 | Print snapshot-only consumption (Phase 3) | 2 | KD coercion, KD reduce, `closedInvoices.reduce`, `Math.max(-balanceAfter)` | **2/2** |
| 6 | **Single canonical formatter (Phase 4)** | **22** | **local `KWD_SUFFIX` constant duplicating `lib/kwd.ts`** | **22/22** |
| **Total** | | | | **81/81 passed** (was 58/58) |

Phase 4 added **23 new lock-down cases**:

- 1 added `collections-page.tsx` to the local-money-formatting suite
- 22 added it across the readonly-projection / single-formatter / etc. surfaces

### D. No deletions

Every remaining frontend financial reconstruction site is **actively
routed in `App.tsx`** and depends on backend DTOs that do not yet
expose the necessary aggregates. Per the Phase 4 mandate
("Delete progressively ONLY after consumer verification, successful
validation, no remaining imports, successful tests and builds"), none
of them were deleted.

They are documented below in the Pending Migration Registry so a
future Phase 5 can retire them systematically.

## Pending Migration Registry

The following surfaces are technically alive but contain frontend
financial reconstruction. Each one is **classified** with the precise
backend support required to retire it.

| # | File | Reconstruction surface | Required backend support |
| --- | --- | --- | --- |
| 1 | `web/src/pages/customer-statement-journal-page.tsx` | running balance + per-event debit/credit reconstruction (`ledgerToStatement`) | The `/journal-statement` endpoint already exists and is gated by `VITE_USE_JOURNAL_API`. Migration = (a) verify endpoint coverage equals `ledgerToStatement` for all event kinds, (b) flip default to `true`, (c) delete the fallback path. |
| 2 | `web/src/pages/monthly-report-full-print-page.tsx` | per-branch payroll net, total payroll net, driver debt total, expenses approved total | Add `monthlyReport.totals.{payrollNetKd, expensesApprovedKd, driverDebtTotalKd}` and `monthlyReport.payrollRows[].netSalaryKd` to the response DTO. |
| 3 | `web/src/pages/monthly-summary-print-page.tsx` | same shape as (2) | Same backend additions reuse here. |
| 4 | `web/src/pages/payslip-print-page.tsx` | `net = basic + allowances + commission − deductions − holds + releases − loan` | Add `payslip.netSalaryKd` (already conceptually owned by the payroll service). |
| 5 | `web/src/pages/payroll-roster-print-page.tsx` | per-row net salary | Same as (4). |
| 6 | `web/src/pages/loan-print-page.tsx` | display-only `.toFixed(3)` (no aggregation) | Trivial — wrap in `formatKwdLabel` once the pre-existing `f()` helper is removed. Low risk. |
| 7 | `web/src/pages/debt-holds-page.tsx` | hold/release totals reduce | Add `debtHolds.totals.{heldKd, releasedKd}` to the list endpoint. |
| 8 | `web/src/pages/debt-transfers-page.tsx` | `outstanding.orders.reduce(... + totalPrice)` | Add `outstanding.totalOutstandingKd` to the row group. |
| 9 | `web/src/pages/executive-dashboard-page.tsx` | daily expense amount sum | Add `executiveDashboard.todayExpensesTotalKd` to the dashboard DTO. |
| 10 | `web/src/pages/reports-page.tsx` | invoice totals aggregation + `closing.netCashAfterExpensesKd < 0` sign comparison | Add `invoices.totals.{totalKd, cashCount, knetCount}` + `closing.netCashIsNegative` boolean to the existing closing summary. |
| 11 | `web/src/modules/driver/pages/my-daily-sales-page.tsx` | driver daily sales sum | Add `myDailySales.totals.totalKd` to the driver scope. |
| 12 | `web/src/modules/driver/pages/my-cash-receipts-page.tsx` | receipts amount aggregation | Add `myCashReceipts.totals.amountKd` to the receipts scope. |
| 13 | `web/src/modules/finance/components/JournalEntryView.tsx` | `totalDebit` / `totalCredit` reduces (display-side verification only) | Either (a) accept canonical totals from the backend in the `JournalEntryDto`, or (b) keep this as the single auditable display-side reconciliation (intentional cross-check, not financial truth). |

**Out of cleanup scope (intentionally untouched):**

- `web/src/utils/finance-engine.ts` — POS engine
- `web/src/pages/pos-page.tsx`
- `web/src/modules/driver/pages/DriverPOS.tsx`
- `web/src/components/orders/pos-invoice-print-view.tsx`
- `web/src/modules/shared/components/pos/pos-auxiliary-ui.tsx`
- `web/src/modules/shared/hooks/use-pos-engine.ts`
- `web/src/modules/accountant/pages/KnetAudit.tsx` — parses external bank statement files (not a financial truth derivation)

These are POS / mutation / external-parser surfaces. Phase 4 forbids
touching them and the rule remains in force.

**Allow-listed (V20.6 Phase 2 file-pragmas, kept as-is):**

- `web/src/lib/sales-debt-analytics.ts`
- `web/src/lib/sales-debt-insights.ts`

Both carry a `// allow-legacy-debt-reader (file)` pragma documenting
why the local aggregation is intentional (gross-vs-collected
analytics, not a wallet/canonical-debt read).

## Validation Gates Run

After every cleanup step, the following validations were executed and
all passed.

| Gate | Result |
| --- | --- |
| `npx jest src/finance/v21-canonical-banking-guards.spec.ts` | **81/81 passed** |
| `npx jest src/finance/canonical-` | **41/41 passed** across 6 suites |
| `npx jest src/finance/canonical- src/finance/v21- src/finance/finance-money` | **125/125 passed** across 8 suites |
| `npx vitest run src/lib/kwd.test.ts` | **3/3 passed** (was 2/2) |
| `npx vitest run` for `v20-7-ui-consistency.test.ts` + `v20-8-ui-consistency-expanded.test.ts` | **6/6 passed** |
| `npx tsc --noEmit -p web/tsconfig.app.json` | **0 errors** |
| `npm run build` (web/) | **success** (1.6s vite build, 0 errors) |
| `npx nest build` (backend) | **success** (23s, 0 errors) |
| `npx eslint src/lib/kwd.ts src/modules/call-center/pages/collections-page.tsx` | 2 **pre-existing** errors unrelated to the change (`_isCcAgent` unused param + `&&` constant truthiness on a line not touched) |

## Stop-The-Line Triggers — None Fired

The Phase 4 mandate listed eight conditions that must immediately
halt cleanup. None of them fired:

- balance drift — none
- statement totals mismatch — none
- projection inconsistency — none
- DTO mismatch — none
- print mismatch — none
- frontend / backend divergence — none
- POS regression — none touched
- reconciliation regression — none touched

## Architecture Outcome

```
                ┌────────────────────────────────────────────────┐
                │              Backend canonical core            │
                │          (V20.4 + V20.5 + V21 P1..P3)          │
                │   journal • snapshots • replay • lineage •     │
                │           hashing • period locks               │
                └────────────────────────┬───────────────────────┘
                                         │  (read-only DTOs only)
                                         ▼
        ┌──────────────────────────────────────────────────────────┐
        │           Single canonical KWD formatter file            │
        │                  web/src/lib/kwd.ts                      │
        │                                                          │
        │   formatKwdLabel        formatKwdAmount                  │
        │   formatKwdLabelGrouped formatSignedKwdLabel             │
        │   sumKwdStrings         subtractKwdStrings               │
        └──────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
            ┌─────────────────────────────────────────────────┐
            │      Migrated render-only display surfaces       │
            │  (28 files locked by 6 V21 guard suites — 81    │
            │   forbidden-pattern cases enforced at CI time)   │
            └─────────────────────────────────────────────────┘
```

After Phase 4 the migrated display surfaces all share **one** money
formatter file, **one** canonical projection contract, **one**
snapshot envelope shape, and **one** hashing/lineage standard. Any
future regression that re-creates a parallel formatter, a local
KWD suffix, or a forbidden display-side aggregation will fail the
guard suite at build time before merge.

## What Phase 4 Did NOT Do

- did not touch POS / Driver POS / `finance-engine.ts`
- did not touch journal posting, reconciliation, settlement
  execution, payment execution, or subscription execution
- did not touch the canonical financial projection layer
- did not introduce any new financial helper module
- did not delete any actively-routed page (the 13 sites in the
  Pending Migration Registry are alive and require backend DTO
  additions before retirement)
- did not change any DTO shape

## Rollback

Phase 4 is fully revertible by undoing two file diffs:

1. `web/src/lib/kwd.ts` — remove the new `formatKwdLabelGrouped` export
2. `web/src/modules/call-center/pages/collections-page.tsx` — restore the local `KWD_SUFFIX` + `formatKwd3` (kept in git history)

…and reverting the V21 guard expansion (suite 6 + the new
`collections-page.tsx` row in suites 1 + 2). No data, schema, or
write-side behaviour was modified, so rollback is purely textual.

## Phase 4 Success Criteria

- [x] one unified financial layer — backend canonical core remains the only writer of money
- [x] one canonical financial truth source — backend DTOs are the only source for migrated surfaces
- [x] one aggregation engine — `replayStatementProjection` + canonical totals, no duplication
- [x] **one money formatting standard — `web/src/lib/kwd.ts` with the new `formatKwdLabelGrouped` variant; the duplicate `formatKwd3`/`KWD_SUFFIX` in collections is gone**
- [x] one canonical projection architecture — Phase 2 + Phase 3 architecture unchanged
- [x] no legacy financial layer remnants on migrated surfaces — locked by 81 guard cases
- [x] frontend remains display-only on migrated surfaces — Phase 2 + Phase 3 + Phase 4 guards cover the surface
- [x] tests + builds + lints all green where the change touched

## Outcome

Safari ERP V21 has graduated from "audit-grade banking integrity
architecture" (Phase 3) to **"single unified financial truth
architecture across the migrated display layer"** (Phase 4). Every
remaining drift surface is documented, classified, and gated behind
specific backend DTO additions — no future cleanup will need to
re-discover the same ground.
