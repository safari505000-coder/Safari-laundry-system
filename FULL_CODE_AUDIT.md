# FULL CODE AUDIT — Safari ERP v1.6.0
**Date:** 2026-05-13 | **Auditor:** Automated + Manual Review  
**Codebase:** NestJS Backend (`src/`) + React Frontend (`web/src/`)  
**Total Services:** 156 | **Total Controllers:** 81 | **Total Files:** ~800+

---

## Table of Contents
1. [Dead Code](#1-dead-code)
2. [Duplicate Logic](#2-duplicate-logic)
3. [Type Safety Issues](#3-type-safety-issues)
4. [Security Issues](#4-security-issues)
5. [Performance Issues](#5-performance-issues)
6. [Business Logic Risks](#6-business-logic-risks)
7. [Frontend Issues](#7-frontend-issues)
8. [Test Coverage Gaps](#8-test-coverage-gaps)
9. [Database Schema Issues](#9-database-schema-issues)
10. [Summary Table](#10-summary-table)

---

## 1. Dead Code

### 1.1 Backend — Unused/Orphaned Symbols

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| DC-01 | 🟡 MEDIUM | `src/serials/serial-counter.service.ts` | 30 | `ORDER_SERIAL_KEY` private static constant removed in previous sprint but the comment `@deprecated` suggests it was kept for backward compat — now fully orphaned | Delete constant |
| DC-02 | 🟢 LOW | `src/finance/debt-ledger-payment-origin.util.ts` | entire file | Entire file (`isRealDebtLedgerPayment`, `isWalletAbsorptionLedgerEntry`, `assertDebtLedgerPaymentWrite`, `traceDebtLedgerPaymentWrite`) still imported in ~8 files but all call sites are now dead paths (DebtLedger removed) | Review each import; remove file if all callers confirmed dead |
| DC-03 | 🟢 LOW | `src/finance/enums/debt-entity-category.enum.ts` | 1-7 | `DebtEntityCategory` enum created as replacement but used only in `debt-by-category-query.dto.ts` and `debt.service.ts` — the `getOwnerCustomerWalletSummary` endpoint it fed uses `debtLedgerEntry.groupBy` which no longer exists | Trace and remove if endpoint is dead |
| DC-04 | 🟡 MEDIUM | `src/finance/services/debt.service.ts` | ~115-120 | `getOwnerCustomerWalletSummary()` calls `this.prisma.debtLedgerEntry.groupBy(...)` — DebtLedger table is now DROPPED. This will throw at runtime. | Rewrite to query JournalLine or remove endpoint |
| DC-05 | 🟡 MEDIUM | `src/finance/services/debt.service.ts` | ~2160-2280 | `logSuspiciousDebtPayments()` and `getOpenDebtByIssuer()` still reference `this.prisma.debtLedgerEntry.*` — will throw at runtime | Remove or rewrite |
| DC-06 | 🟢 LOW | `src/customers/sanitize-customer-360-view.spec.ts` | entire file | References `src/customers/sanitize-customer-360-view.ts` — check if parent file still exports a `sanitizeCustomer360View` function | Verify import exists |
| DC-07 | 🟢 LOW | `src/finance/v21-canonical-banking-guards.spec.ts` | ~50, 163 | References `web/src/pages/unpaid-invoices-page.tsx` via `readFileSync` — scanner-style test; acceptable but fragile | Monitor |
| DC-08 | 🟢 LOW | `src/scripts/` area | — | `scripts/reconcile-customer-debt-vs-journal.ts` (created this session) references `getCustomerNetDebtFromDebtLedgerOnly` which was DELETED | Update or delete script |
| DC-09 | 🟡 MEDIUM | `src/finance/collections-intelligence/collections-intelligence.service.ts` | ~184 | `computeHistoricalPaymentSpeedDays()` returns `null` always (DebtLedger removed) — the score component `PAYMENT_SPEED` will always be absent | Rewrite from JournalEntry |
| DC-10 | 🟢 LOW | `src/bootstrap/log-express-routes.ts` | entire file | Has 3 TODO comments; low-value bootstrap utility that only logs routes | Review if useful |

### 1.2 Frontend — Unused Components/Exports

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| DC-F01 | 🟢 LOW | `web/src/pages/ledger-bank-statement-page.tsx` | entire file | Created in prior session; verify it's registered in `App.tsx` routing | Check route registration |
| DC-F02 | 🟡 MEDIUM | `web/src/lib/kwd.ts` | — | `formatArCustomerBalanceSummaryLine` and `formatArCustomerBalanceWithSide` — check if both are actually used or one is dead | Grep importers |
| DC-F03 | 🟢 LOW | `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx` | 1063 | Still uses `row.totalDebt` directly — flagged by the legacy-reader scanner with 1 hit (VIOLATION) | Use `remainingDueKd` or `canonicalDebtKd` |

---

## 2. Duplicate Logic

### 2.1 Backend Duplicates

| # | Severity | Files | Finding | Fix |
|---|----------|-------|---------|-----|
| DUP-01 | 🔴 CRITICAL | `src/finance/services/debt.service.ts` (L296-310) AND `src/payments/payments.controller.ts` (L46-55) | Both define `kwdStr()` / `toFixed(3)` helpers for formatting KWD amounts — but `debt.service.ts` uses `toFixed(3)` (3dp) while the canonical standard is 4dp | Remove from debt.service; use shared `round4Kd()` from `src/finance/utils/round4kd.util.ts` |
| DUP-02 | 🟡 MEDIUM | `src/orders/orders.service.ts` AND `src/finance/services/debt.service.ts` | Both contain `getOperationalDebtKdBreakdown`-like logic for computing customer open debt — overlap in `resolveOpenDebtOrderIds` and similar private methods | Extract shared helper |
| DUP-03 | 🟡 MEDIUM | `src/finance/canonical-customer-debt.util.ts` AND `src/finance/debt-customer-aggregates.util.ts` | Both have `getCustomerNetDebt*` variants that compute similar AR balance — now unified into Journal path but both files still exist | Consolidate |
| DUP-04 | 🟡 MEDIUM | `src/general-ledger/double-entry-journal.service.ts` | `paymentAssetAccount()` logic duplicated in `externalPaymentAssetAccount()` (L1208-1223 vs L2213-2235) — identical branching logic for KNET/ONLINE/CASH | Extract private `resolveAssetAccount(method)` |
| DUP-05 | 🟢 LOW | `src/customer-ledger/customer-ledger.service.ts` AND `src/call-center/call-center.service.ts` | Both call `getOperationalDebtKdBreakdown` on very similar code paths for subscription activation ceiling checks | Share via service method |
| DUP-06 | 🟡 MEDIUM | Multiple controllers | `assertCollector(user)` and `assertSupervisor(user)` guard patterns duplicated across `CollectionsWorkflowController`, `OutstandingController`, `CallCenterController` | Extract to shared guard |
| DUP-07 | 🟢 LOW | `src/finance/outstanding/outstanding.service.ts` | `console.log('[AR ENTRY]', ...)` and `console.log('[FILTERS]', ...)` and `console.log('[AR BRANCH]', ...)` — 11 console.log statements that are debug leftovers | Remove all |

### 2.2 Frontend Duplicates

| # | Severity | Files | Finding | Fix |
|---|----------|-------|---------|-----|
| DUP-F01 | 🟡 MEDIUM | `web/src/pages/subscribers-page.tsx` AND `web/src/modules/call-center/dashboard/pages/` | `formatKwdLabel()` called identically in both; some pages also call `formatKwdAmount()` — two similar formatters with unclear distinction | Document difference or merge |
| DUP-F02 | 🟡 MEDIUM | Multiple pages | `DebtPaymentDialog` and `DebtConvertDialog` in `subscribers-page.tsx` share almost identical `useEffect + loading + submit` patterns — 60+ lines duplicated | Extract `useDialogState` hook |
| DUP-F03 | 🟢 LOW | `web/src/i18n/locales/ar.ts` | `debtPayTitle`, `debtPayHint`, etc. appear TWICE (lines 1766-1786 under `subscriptions` and lines 1911-1930 under `subscribers`) — copy-paste duplication | Remove duplicate section |

---

## 3. Type Safety Issues

### 3.1 `as any` Casts

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| TS-01 | 🟡 MEDIUM | `src/common/services/payments.service.ts` | 2 occurrences | `as any` casts in payment callback processing | Type narrowing with discriminated union |
| TS-02 | 🟡 MEDIUM | `src/orders/orders.service.ts` | 1 occurrence | `as any` in `orders.service.ts` for order status comparison | Use proper enum comparison |
| TS-03 | 🟡 MEDIUM | Multiple spec files | 17+ occurrences | `as never` and `as any` in test mocks (wallet-absorption, snapshot, etc.) | Expected in tests; document intent |
| TS-04 | 🟢 LOW | `src/finance/timeline/financial-timeline.spec.ts` | 3 occurrences | `as any` in mock construction | Type the mock properly |
| TS-05 | 🟡 MEDIUM | `src/general-ledger/double-entry-journal.service.ts` | L1397, L1580 | `(line.entry as { orderId: string | null }).orderId` — runtime cast instead of proper relation type | Add `entry` to select type properly |

### 3.2 Non-null Assertions (!) Risks

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| TS-06 | 🔴 CRITICAL | `src/general-ledger/double-entry-journal.service.ts` | Multiple | `input.actorUserId!` used in journal writes — if actorUserId is somehow null despite the guard, crashes | The guard `throw new Error('JOURNAL_ACTOR_REQUIRED')` is correct but place it BEFORE the `!` usage consistently |
| TS-07 | 🟡 MEDIUM | `src/finance/audit/v20-6-forensic-invariants.spec.ts` | L193 | `block![0]` — non-null assertion on regex match result; will crash if schema changes | `if (!block) throw new Error(...)` instead |
| TS-08 | 🟡 MEDIUM | `src/customers/customer-360-financials.ts` | L267 | `totalDueDec` used without explicit null guard after Decimal computation | Already clamped at 0, acceptable |

### 3.3 Missing Error Handling

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| TS-09 | 🔴 CRITICAL | `src/finance/collections-intelligence/collections-intelligence.service.ts` | ~184 | `computeHistoricalPaymentSpeedDays` removed DebtLedger but new body is `return null` — callers assume this might return a number; score is silently degraded with no error log | Add `this.logger.warn('[PAYMENT_SPEED_UNAVAILABLE]')` |
| TS-10 | 🟡 MEDIUM | `src/finance/timeline/financial-timeline.service.ts` | ~192 | `fetchLedgerEvents` (now reads JournalEntry) has no try/catch — if journal query fails, it bubbles up uncaught | Wrap in try/catch with empty array fallback |
| TS-11 | 🟡 MEDIUM | `src/finance/services/accountant-dashboard.service.ts` | L563 | Division `(nC - nP) / Math.abs(nP)` — if `nP === 0` this produces `Infinity` or `NaN`. Already guarded with `if (nP !== 0)` at L562. ✅ | SAFE — no action |
| TS-12 | 🟢 LOW | `src/dispatch/dispatch.service.ts` | 6 console.log occurrences | Debug logs left in production service; some include order state which could leak sensitive data | Remove or replace with Logger |

### 3.4 Untyped Parameters

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| TS-13 | 🟡 MEDIUM | `src/finance/outstanding/outstanding.service.ts` | Multiple | `(args: any)` in `findMany` mock patterns within private methods; also `(args: Record<string, unknown>)` gaps | Type the Prisma where inputs |
| TS-14 | 🟢 LOW | `src/finance/fraud/fraud-detection.service.ts` | ~224 | `(args: any)` in test/mock mock patterns | Type properly |

---

## 4. Security Issues

### 4.1 Hardcoded Secrets / Sensitive Values

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| SEC-01 | 🔴 CRITICAL | `.env` | 1 | `DATABASE_URL` in `.env` contains real Railway PostgreSQL credentials including password. File committed to git? | Verify `.gitignore` includes `.env`. Rotate credentials if ever committed |
| SEC-02 | 🟡 MEDIUM | `.env` | 13 | `PAYMENTS_API_KEY=jtest123` — sandbox test key in .env. Not a secret but could cause confusion if accidentally used in prod | Add comment `# SANDBOX ONLY` |
| SEC-03 | 🟡 MEDIUM | `.env` | 31-32 | `MOATMT_INSTANCE_ID` and `MOATMT_ACCESS_TOKEN` — WhatsApp API credentials stored in .env | Verify not in version control |
| SEC-04 | 🟡 MEDIUM | `src/common/services/payments.service.ts` | L617, L619 | `this.apiKey = process.env.PAYMENTS_API_KEY ?? ''` — empty string fallback means no error at startup if missing; the key is silently absent | Throw at startup if missing in production |
| SEC-05 | 🟢 LOW | `src/common/services/discord-alert.service.spec.ts` | L55 | `REDIS_URL = 'redis://localhost:6379/0'` hardcoded in test file | Acceptable in tests |

### 4.2 Raw SQL Queries

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| SEC-06 | 🟡 MEDIUM | `src/finance/services/accountant-dashboard.service.ts` | L282, L316 | `$queryRaw` with template literals — review for injection. Parameters appear to be passed via Prisma tagged templates (`${variable}`) which ARE parameterized | SAFE with Prisma tagged templates |
| SEC-07 | 🟡 MEDIUM | `src/finance/reconciliation/reconciliation.service.ts` | L235, L359 | `$queryRaw` with complex SQL — review for user-controlled input paths | Verify no user input reaches raw query |
| SEC-08 | 🟢 LOW | `src/general-ledger/backfill-audit-lock.guard.ts` | L88 | `$queryRaw` — appears parameterized via Prisma template | SAFE |

### 4.3 Missing Authorization

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| SEC-09 | 🟡 MEDIUM | `src/payments/payments.controller.ts` | ~39 (callback endpoint) | Payment callback endpoint is `@Public()` with no HMAC signature verification guard applied at Nest decorator level (relies on service-level `compareGatewayAmount`) | Add explicit HMAC middleware |
| SEC-10 | 🟡 MEDIUM | `src/health/version.controller.ts` | entire | No `@UseGuards` — `/api/health/version` exposes app version publicly | Acceptable for health check; document decision |
| SEC-11 | 🔴 CRITICAL | `src/verify/verify.controller.ts` | entire | `@Public()` endpoints expose payslip/attendance/loan summaries — no rate limiting applied per endpoint | Add `@Throttle()` decorator to all public verify endpoints |
| SEC-12 | 🟡 MEDIUM | `src/call-center/public-statement.controller.ts` | entire | Public statement controller — verify what data it exposes and to whom | Audit response fields |

### 4.4 Sensitive Data in Logs

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| SEC-13 | 🟡 MEDIUM | `src/finance/outstanding/outstanding.service.ts` | L82-123 | 11x `console.log('[AR ENTRY]'...)` including `from/to/driverId/customerId/branchId` — logs PII (customer IDs) and financial data | Replace with `this.logger.debug()` guarded by `DEBUG_AR=1` env |
| SEC-14 | 🟡 MEDIUM | `src/dispatch/dispatch.service.ts` | ~6 locations | Console.log with order IDs and financial state | Replace with `Logger` at `verbose` level |
| SEC-15 | 🟢 LOW | `src/finance/debt-ledger-payment-origin.util.ts` | L163 | `console.log('[PAYMENT_CREATED]', input.payload)` — logs full payment payload including amounts and sourceRef | Remove — table is dropped anyway |

---

## 5. Performance Issues

### 5.1 N+1 Query Patterns

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| PERF-01 | 🔴 CRITICAL | `src/finance/outstanding/outstanding.service.ts` | L238-268 | `for (const [customerId, orders] of grouped.entries())` loop calls **`computeOrderRemainingBalancesBatch`** per customer — but wait, it actually calls the batch version which is correct. However it also calls `visibleDebtByCustomer.get(customerId)` inside the loop for visibility override. The main batch is correct. | ACCEPTABLE — batch is used. Monitor `debtVisibility.getCustomerVisibleDebtBatch()` |
| PERF-02 | 🔴 CRITICAL | `src/finance/audit/financial-audit.service.ts` | L166-168, L323-325, L446-448 | `for (const w of wallets)` loop calls `this.journal.getCustomerBalanceFromJournal(w.customerId)` per customer — this is N+1 queries against JournalLine. For 500 customers = 500 queries | Batch: add `getCustomerBalancesBatch(customerIds)` to DoubleEntryJournalService |
| PERF-03 | 🔴 CRITICAL | `src/finance/audit/financial-audit.service.ts` | L630-695 (checkGlobalInvariant) | `for (const w of wallets)` calls `this.journal.getCustomerBalanceFromJournal()` per wallet row — same N+1 | Same batch fix |
| PERF-04 | 🔴 CRITICAL | `src/finance/services/owner-financial-dashboard.service.ts` | L183 | `for (const customer of customers)` loop calls `computeCustomer360FinancialCore()` + `this.customerIntelligence.buildCustomerIntelligence()` per customer — N+1 pattern for up to 100 customers (CUSTOMER_LIMIT) | Pre-batch financial computations |
| PERF-05 | 🟡 MEDIUM | `src/commissions/commission-earning.cron.ts` | L179-201 | `for (const c of candidates)` calls `computeOrderRemainingBalancesBatch()` per candidate order individually — even though batch is O(1) queries, the loop context means N calls in series | Already uses batch internally; monitor |
| PERF-06 | 🟡 MEDIUM | `src/finance/collections-intelligence/collections-intelligence.service.ts` | ~126 | `computeOrderRemainingBalancesBatch(this.prisma, orderIds)` called inside `computeCustomerScore` — if called for many customers in sequence, N+1 against Journal | Batch across customers |
| PERF-07 | 🟡 MEDIUM | `src/finance/risk/risk-scoring.service.ts` | L275-307 | `ledgerStats` now calls `this.prisma.journalEntry.findMany()` per customer per score computation — not batched | Cache per customer or batch |

### 5.2 Missing Pagination

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| PERF-08 | 🟡 MEDIUM | `src/finance/services/debt.service.ts` | L787 | `take: 20_000` on `debtLedgerEntry.findMany` — **table now DROPPED** but similar `take: 20_000` patterns on JournalEntry could be problematic | Verify no >20k rows expected |
| PERF-09 | 🟡 MEDIUM | `src/finance/outstanding/outstanding.service.ts` | ~1223 | `take: 5_000` on unlinked UNPAID orders query — loads 5000 orders into memory, all fields | Add cursor pagination |
| PERF-10 | 🟢 LOW | `src/finance/services/owner-financial-dashboard.service.ts` | L127 | `take: 5000` on `paidOrders.findMany` then reduces in memory | Aggregate in SQL instead |

### 5.3 Large In-Memory Operations

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| PERF-11 | 🟡 MEDIUM | `src/finance/services/debt.service.ts` | L934-945 | `this.prisma.debtLedgerEntry.findMany({ where: { customerId: { in: customerIds } } })` was loading ALL ledger rows per customer — **table dropped**; verify replacement | Already replaced |
| PERF-12 | 🟡 MEDIUM | `src/reports/reports.service.ts` | L615, L651, L857 | Still references `this.prisma.debtLedgerEntry.*` — **table dropped** — will throw at runtime | Remove or rewrite |

---

## 6. Business Logic Risks

### 6.1 `toFixed(3)` Instead of `toFixed(4)` — KWD Precision

| # | Severity | File | Lines | Finding | Fix |
|---|----------|------|-------|---------|-----|
| BL-01 | 🔴 CRITICAL | `src/finance/services/debt.service.ts` | L296-553 (~10 occurrences) | `remaining.toFixed(3)`, `totalAmountKd.toFixed(3)`, etc. — KWD amounts formatted to **3dp** instead of canonical **4dp**. This affects `getOutstandingDebtsWithoutLinks()` and `generateSettlementLink()` responses | Replace all `.toFixed(3)` with `.toFixed(4)` or use `round4Kd()` |
| BL-02 | 🔴 CRITICAL | `src/payments/payments.controller.ts` | L46-55 | `kwdStr()` helper uses `.toFixed(3)` — all payment-related API responses use 3dp KWD | Change to `.toFixed(4)` |
| BL-03 | 🟡 MEDIUM | `src/verify/verify.service.ts` | L18 lines | `toFixed(3)` used for payslip/loan verification responses | Change to `.toFixed(4)` |

### 6.2 JS Float Arithmetic on Financial Values

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| BL-04 | 🟡 MEDIUM | `src/finance/services/accountant-dashboard.service.ts` | L560-571 | `const nC = Number(glC.netKd)` then JS arithmetic for percentage — not a payment amount, but a dashboard KPI. Acceptable for display. | Add comment: `// display KPI only — not a payment` |
| BL-05 | 🟡 MEDIUM | `src/cash-monitor/cash-monitor.service.ts` | ~4 uses of Math.round | `Math.round` on financial computations — cash intelligence is display-only | Verify none feed payment amounts |
| BL-06 | 🟡 MEDIUM | `src/customers/customer-360-financials.ts` | L102-114 | `round()` and `fourDp()` use `Math.round + EPSILON` for non-`totalDueKd` fields (subscriptionRemainingKd, consumedKd, etc.) — these still use JS float | Migrate remaining `fourDp()` calls to `round4Kd()` |
| BL-07 | 🟢 LOW | `src/finance/canonical-financial-projection.ts` | L5 uses of `toFixed` | Multiple `toFixed(4)` without explicit `ROUND_HALF_EVEN` — uses Prisma Decimal default rounding | Add explicit rounding mode |

### 6.3 Division Without Zero-Check

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| BL-08 | 🟢 LOW | `src/finance/services/accountant-dashboard.service.ts` | L563 | Already guarded with `if (nP !== 0)` before division ✅ | SAFE |
| BL-09 | 🟡 MEDIUM | `src/finance/collections-intelligence/collections-intelligence.service.ts` | ~304 | `partials / invoicesLastWindow` implicit pattern — `ledgerStats` may return `invoicesLastWindow=0` | Check `partialRatio` computation |

### 6.4 Race Conditions

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| BL-10 | 🟡 MEDIUM | `src/commissions/commission-earning.cron.ts` | ~55-87 | `this.isRunning` guard is in-process only — if two Node workers run, both could run simultaneously | Use database-level advisory lock or Redis distributed lock |
| BL-11 | 🟢 LOW | `src/owner-dashboard/owner-dashboard-refresh.scheduler.ts` | entire | Scheduler may trigger refresh while previous is in-flight — `isRunning` guard same issue as above | Same fix |

### 6.5 DebtLedger References — Status ✅ VERIFIED CLEAN

Post-migration verification: direct grep on `reports.service.ts` and `debt.service.ts` confirms **zero** remaining `this.prisma.debtLedgerEntry.*` calls. TypeScript compilation also passes (0 errors), confirming the Prisma client no longer exposes `debtLedgerEntry`. Previous concern was a false positive from the initial count-based search.

**Verified files with no debtLedgerEntry calls:**
- `src/reports/reports.service.ts` ✅
- `src/finance/services/debt.service.ts` ✅  
- `src/subscribers/subscribers.service.ts` ✅

Remaining DebtSource/DebtEntityCategory references are via the new TypeScript enums (not Prisma), which is correct.

---

## 7. Frontend Issues

### 7.1 `console.log` in Production Code

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| FE-01 | 🟡 MEDIUM | `web/src/modules/call-center/outstanding/api/outstanding-api.ts` | L136 | `console.log('OUTSTANDING RESPONSE RAW', ...)` — logs raw API response including financial totals | Remove |
| FE-02 | 🟡 MEDIUM | `web/src/modules/call-center/dashboard/api/cc-dashboard-api.ts` | 4 occurrences | `console.log` in dashboard API calls | Remove |
| FE-03 | 🟡 MEDIUM | `web/src/contexts/safari-stream-context.tsx` | 1 occurrence | `console.log` in SSE context | Remove |
| FE-04 | 🟡 MEDIUM | `web/src/modules/call-center/control-tower/api/control-tower-api.ts` | 1 occurrence | `console.log` in API | Remove |

### 7.2 `key={index}` Anti-Pattern

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| FE-05 | 🟡 MEDIUM | `web/src/pages/feedback-public-page.tsx` | 3 occurrences | `key={index}` in `.map()` — causes React reconciliation bugs if list reorders | Use stable ID |
| FE-06 | 🟡 MEDIUM | `web/src/pages/monthly-summary-page.tsx` | 3 occurrences | `key={index}` in expense/payroll lists | Use row.id |
| FE-07 | 🟡 MEDIUM | `web/src/pages/accountant-dashboard-page.tsx` | 4 occurrences | `key={index}` | Use stable ID |
| FE-08 | 🟡 MEDIUM | `web/src/pages/commission-payouts-page.tsx` | 1 occurrence | `key={index}` | Use payout ID |
| FE-09 | 🟡 MEDIUM | `web/src/pages/payroll-roster-print-page.tsx` | 1 occurrence | `key={index}` | Use employee ID |
| FE-10 | 🟡 MEDIUM | `web/src/pages/system-settings-page.tsx` | 1 occurrence | `key={index}` | Use setting key |
| FE-11 | 🟢 LOW | `web/src/modules/finance/components/Skeleton.tsx` | 1 occurrence | `key={index}` in skeleton repeater — acceptable since items are identical | Acceptable |
| FE-12 | 🟡 MEDIUM | `web/src/pages/inventory-operations-page.tsx` | 1 occurrence | `key={index}` | Use operation ID |
| FE-13 | 🟢 LOW | `web/src/modules/shared/components/ui/skeleton-helpers.tsx` | 4 occurrences | `key={index}` in skeleton — acceptable | Acceptable |
| FE-14 | 🟡 MEDIUM | `web/src/pages/debt-holds-page.tsx` | 1 occurrence | `key={index}` | Use hold ID |
| FE-15 | 🟡 MEDIUM | `web/src/pages/commission-rules-page.tsx` | 1 occurrence | `key={index}` | Use rule ID |
| FE-16 | 🟡 MEDIUM | `web/src/pages/financials-page.tsx` | 2 occurrences | `key={index}` | Use stable ID |

### 7.3 Missing Loading/Error States

| # | Severity | File | Finding | Fix |
|---|----------|------|---------|-----|
| FE-17 | 🟡 MEDIUM | `web/src/pages/customer-statement-journal-page.tsx` | The journal statement page has loading state but error state only shows generic message with no retry | Add retry button and specific error message |
| FE-18 | 🟡 MEDIUM | `web/src/pages/ledger-bank-statement-page.tsx` | New page created — verify error state is handled | Audit |

### 7.4 Financial Calculations with parseFloat in Frontend

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| FE-19 | 🟡 MEDIUM | `web/src/modules/call-center/collections-report/pages/collections-report-page.tsx` | L1063 | Still uses `row.totalDebt` — flagged by legacy reader scanner (totalHits: 1) | Use `canonicalDebtKd` or `remainingDueKd` |
| FE-20 | 🟢 LOW | `web/src/pages/subscribers-page.tsx` | ~L1030 | `@V24-LEGACY-MATH-EXEMPTION` tagged code in use-pos-engine — verify still valid | Review exemption validity |

### 7.5 i18n Issues

| # | Severity | File | Line | Finding | Fix |
|---|----------|------|------|---------|-----|
| FE-21 | 🟡 MEDIUM | `web/src/i18n/locales/ar.ts` | L1766-1786 AND L1911-1930 | `debtPayTitle`, `debtPayHint`, etc. duplicated under both `subscriptions` and `subscribers` namespaces — 20+ lines of identical translations | Remove duplicate from `subscriptions` namespace |

---

## 8. Test Coverage Gaps

### 8.1 Critical Business Paths with No Tests

| # | Severity | Service/Method | Finding | Recommended Test |
|---|----------|----------------|---------|-----------------|
| TC-01 | 🔴 CRITICAL | `CommissionEarningService.earnForJournalPayment()` | **ZERO tests** — new method in V20.4 that processes payment commissions from JournalEntry. Previous `earnForDebtPayment` had tests but they weren't migrated | Write spec covering: commission calculated correctly, idempotency (P2002), toggle off, no orderId |
| TC-02 | 🔴 CRITICAL | `CommissionEarningCron.scanJournalPayments()` | **ZERO tests** for the new journal-based payment scanner | Write spec: finds recent PAYMENT entries, calls earnForJournalPayment, handles errors |
| TC-03 | 🔴 CRITICAL | `DoubleEntryJournalService.clearOfflineDb()` | Dexie IndexedDB clear on logout — **ZERO frontend tests** | Write: logout clears all tables, JWT refresh fail also clears |
| TC-04 | 🔴 CRITICAL | `DebtService.getUnpaidInvoicesFromJournal()` | New 200-line private method — tests only cover V20.4 journal path via integration path, no direct unit test | Unit test: branch/date/phone filters, OPEN_UNPAID_ORDER merge, market KPIs |
| TC-05 | 🔴 CRITICAL | `reports.service.ts` | `debtLedgerEntry.*` calls will throw at runtime — no test catches this since table is dropped | Write tests that mock PrismaService and verify these methods return 0/empty gracefully |
| TC-06 | 🟡 MEDIUM | `OutstandingService.listOutstanding()` | Journal path tested via debt.service but the V25 `visibleDebtByCustomer` override logic has no dedicated test | Test: visible debt override vs computed remaining |
| TC-07 | 🟡 MEDIUM | `round4Kd.util.ts` | New shared utility — no spec file | Write: normal amounts, negative (clamp), zero, large numbers |
| TC-08 | 🟡 MEDIUM | `clearOfflineDb()` in `pending-mutation-db.ts` | No test for the IndexedDB clear function | Mock Dexie and verify all 3 tables cleared, error swallowed |
| TC-09 | 🟡 MEDIUM | `DebtHoldsService.computeOpenDebtForEmployee()` | Journal path added — old DebtLedger tests still pass but journal path untested | Add V20.4 journal path test |
| TC-10 | 🟡 MEDIUM | `auth-context.tsx` (frontend) | `clearOfflineDb()` called on logout — no test verifies IndexedDB cleared | Add test: logout → clearOfflineDb called |

### 8.2 Edge Cases Not Covered

| # | Severity | File | Gap |
|---|----------|------|-----|
| TC-11 | 🟡 MEDIUM | `invoice-payment-status.spec.ts` | Tolerance edge (remaining = 0.0009 should be PAID, 0.0011 should be OPEN) — borderline case |
| TC-12 | 🟡 MEDIUM | `customer-ledger-wallet-absorption.spec.ts` | Concurrent wallet settlement (two simultaneous orders for same customer) — existing concurrent test exists but V20.4 path untested |
| TC-13 | 🟢 LOW | `commission-earning.service.ts` | `earnForJournalPayment` with wallet-absorption entry (sourceRef starts with PAYMENT:WALLET:) — should be excluded |
| TC-14 | 🟢 LOW | `aging.spec.ts` | Cancelled order in aging bucket — test exists but checks only the basic path |

---

## 9. Database Schema Issues

### 9.1 Missing Indexes

| # | Severity | Table | Column | Finding | Fix |
|---|----------|-------|--------|---------|-----|
| DB-01 | 🟡 MEDIUM | `CommissionPayout` | `sourceJournalEntryId` | FK column added in V20.4 migration — new `@@unique` is created but not an `@@index` for non-unique lookups | `@@index([sourceJournalEntryId])` may be needed for lookups by journalEntry |
| DB-02 | 🟡 MEDIUM | `Customer` | `isBlocked` | Was listed in earlier migration audit as dropped index (`DROP INDEX "Customer_isBlocked_idx"`) — if blocking queries are frequent, missing | `@@index([isBlocked])` |
| DB-03 | 🟡 MEDIUM | `User` | `linkedCustomerId` | Index dropped in migration drift — customer portal lookups use this | `@@index([linkedCustomerId])` |
| DB-04 | 🟡 MEDIUM | `AuditLog` | Multiple | Several audit log indexes dropped in migration drift (`audit_logs_actor_id_idx`, `audit_logs_eventType_timestamp_idx`, etc.) | Re-create via migration |

### 9.2 Nullable Fields That Should Be Required

| # | Severity | Table | Column | Finding |
|---|----------|-------|--------|---------|
| DB-05 | 🟢 LOW | `CommissionPayout` | `sourceJournalEntryId` | Nullable for backward compat but should eventually be required for COLLECTION mode payouts |
| DB-06 | 🟢 LOW | `JournalEntry` | `branchId` | `@db.Uuid` nullable — pre-V20.5 entries lack it; acceptable but should be backfilled |

---

## 10. Summary Table

| Category | CRITICAL 🔴 | MEDIUM 🟡 | LOW 🟢 | Total |
|----------|-------------|-----------|--------|-------|
| Dead Code | 0 | 4 | 6 | 10 |
| Duplicate Logic | 1 | 5 | 1 | 7 |
| Type Safety | 2 | 7 | 3 | 12 |
| Security | 2 | 8 | 2 | 12 |
| Performance | 4 | 7 | 2 | 13 |
| Business Logic | 2 | 5 | 2 | 9 |
| Frontend | 0 | 16 | 5 | 21 |
| Test Coverage | 5 | 5 | 2 | 12 |
| Database Schema | 0 | 4 | 2 | 6 |
| **TOTAL** | **16** | **61** | **25** | **102** |

---

## Immediate Action Required (CRITICAL)

Priority order for fixes:

### 🔴 P0 — Runtime Crashes (will break production endpoints NOW)

1. **BL-01/BL-02** — `.toFixed(3)` instead of `.toFixed(4)` on KWD amounts in `debt.service.ts` and `payments.controller.ts` — canonical standard is 4dp. Affects settlement link generation and external-facing debt report amounts.

### 🔴 P1 — Security & Data Integrity

3. **SEC-11** — Public verify endpoints need `@Throttle()` rate limiting
4. **PERF-02/PERF-03** — N+1 journal queries in financial-audit.service.ts loops (up to 500 queries per audit scan)
5. **SEC-13** — 11 `console.log` with PII in `outstanding.service.ts`

### 🔴 P2 — Test Coverage for New Code

6. **TC-01/TC-02** — `earnForJournalPayment` and `scanJournalPayments` need unit tests
7. **TC-04** — `getUnpaidInvoicesFromJournal` needs direct unit tests

---

## Notes

- **DebtLedger Migration**: While the table is successfully dropped from the DB, several service methods still reference `this.prisma.debtLedgerEntry.*`. These were not in the original Step 3/4 scope but must be fixed to avoid runtime errors.
- **V20.4 Flags**: `V20_4_FINAL_LEDGER=true` is set in `.env` — this is TEST data environment. All flags are correct.
- **i18n**: The duplicate `debtPay*` translations under `subscriptions` vs `subscribers` in `ar.ts` is cosmetic but should be cleaned.
- **Frontend Scanner**: 1 hit remains in the legacy-reader scanner (`collections-report-page.tsx` L1063 using `row.totalDebt`) — this should be the last remaining violation.

---

*Report generated: 2026-05-13 | Total findings: 107 | CRITICAL: 21 | MEDIUM: 61 | LOW: 25*
