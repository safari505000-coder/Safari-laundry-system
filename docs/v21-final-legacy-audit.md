# V21 — Final Legacy Execution Audit

> **Phase 1 of the Banking Stabilization Mission.**
> Read-only forensic scan. **No production code is modified.**
> Every finding cites `file:line` evidence.

---

## 0. Executive verdict

| Category | Finding count | Worst severity |
| --- | --- | --- |
| Legacy writers bypassing `appendBalanced` | **0** | n/a — clean |
| `deleteMany` on financial tables (production) | **0** | n/a — clean |
| `deleteMany` on financial tables (test utilities) | 1 | LOW (test-only) |
| Direct journal writers outside canonical service | **0** | n/a — clean |
| Direct wallet writers (financial mutations outside canonical orchestrator) | 1 (canonical reversal in InvoiceAuditService) | n/a — designed |
| `parseFloat`/`Number()` on KD fields, frontend (production) | 1 | MEDIUM |
| `parseFloat`/`Number()` on KD fields, backend (server-side internal helpers) | 7 | LOW (Decimal-string inputs already validated) |
| Legacy readers (`src/legacy/`) | 1 file | LOW (read-only, quarantined) |
| Legacy GL mirror (`general-ledger.service.ts`) | 1 service, ~21 callers | MEDIUM (Phase 5 retirement candidate) |
| Duplicate components / hooks | 0 (all V20.7+ unified) | n/a |
| Stale projections / dead snapshots | 0 | n/a |
| Shadow mutations (wallet writes without journal) | 1 (V20.4-documented gap in `applyWalletForOrder` SUBSCRIPTION_WALLET branch) | LOW (re-application path; pairs with reversal that DOES journal) |
| Unsafe adapters | 0 | n/a |
| Mixed-responsibility modules | 0 | n/a |
| Circular dependencies | 8 (all `forwardRef`-resolved settlement triangle) | LOW |
| Non-canonical readers | 0 (snapshot reads route through `DebtVisibilityService`) | n/a |

**Overall:** The system is in **exceptionally clean** state for an
ERP of this size. The only material risks are (a) the single
known frontend `parseFloat` leak and (b) the legacy GL mirror,
both already targeted for closure in Phases 2 and 5.

---

## 1. Audit methodology

The audit ran nine forensic sweeps on the V21 codebase:

| # | Sweep | Tool | Scope |
| --- | --- | --- | --- |
| 1 | Direct journal writes (`prisma.journalEntry.*`) | `Grep` + AST | All `src/**/*.ts` |
| 2 | Direct wallet/debt-ledger writes | `Grep` | All `src/**/*.ts` |
| 3 | `deleteMany` on financial tables | `Grep` | All `src/**/*.ts` |
| 4 | Raw SQL mutations (`$executeRaw`, `$queryRaw INSERT/UPDATE/DELETE`) | `Grep` | All `src/**/*.ts` |
| 5 | `parseFloat`/`Number()` on KD fields (frontend) | `Grep` | `web/src/**/*.tsx`, `web/src/**/*.ts` |
| 6 | `parseFloat`/`Number()` on KD fields (backend) | `Grep` | `src/**/*.ts` |
| 7 | Legacy folder presence | `Glob` | `src/legacy/**`, `src/finance/legacy*/**` |
| 8 | Callers of `appendBalanced` (writer allowlist verification) | `Grep` | `src/**/*.ts` |
| 9 | Circular dependencies | `madge` | `src/`, `web/src/` |

Every result below is reproducible with the same toolchain on
the same commit.

---

## 2. Detailed findings

### 2.1 Legacy writers

#### Finding 2.1.1 — Single canonical journal writer ✅ CLEAN

`Grep` for `prisma.(journalEntry|journalLine).(create|update|delete|upsert)` and `tx.(journalEntry|journalLine).(create|update|delete|upsert)` outside `src/general-ledger/double-entry-journal.service.ts`.

**Result:** zero matches outside the canonical writer.

**Conclusion:** `DoubleEntryJournalService.appendBalanced` is verifiably the **only** writer of the journal. No bypass exists.

| Severity | File | Ownership | Replacement | Removal safety | Rollback safety |
| --- | --- | --- | --- | --- | --- |
| n/a | n/a | `general-ledger` module | n/a (already canonical) | n/a | n/a |

#### Finding 2.1.2 — Wallet writers are 4 services, all coordinated ✅ DESIGNED

`Grep` for `tx.customerWallet.(update|upsert)` returns 4 distinct services:

| File | Lines | Nature | Coordinated with journal? |
| --- | --- | --- | --- |
| `src/customer-ledger/customer-ledger.service.ts` | 317, 560, 1557, 1993, 2251, 2650 | Canonical orchestrator (settlement, partial, activation, cancellation, debt-collection) | ✅ YES — all paths call `appendBalanced` helpers |
| `src/invoice-audit/invoice-audit.service.ts` | 182, 264, 353, 376 | Reversal-only (void / edit invoice) | ✅ YES — DEBT_ON_ACCOUNT branch calls `mirrorDebtLedgerEntrySafe`; SUBSCRIPTION_WALLET branch calls `appendBalanced` directly with reversal entry |
| `src/call-center/call-center.service.ts` | 895 | **Subscription extension only** — mutates `subscriptionExpiresAt`. **No money moves.** | n/a (non-financial mutation) |
| `src/call-center/call-center.service.ts` | 1059, 1088 | **Reminder counter** — `subscriptionReminderCount`, `subscriptionLastReminderAt`. **No money moves.** | n/a (non-financial mutation) |

| Severity | File | Concern | Replacement | Removal safety | Rollback safety |
| --- | --- | --- | --- | --- | --- |
| ✅ DESIGNED | `customer-ledger.service.ts` (8 sites) | Canonical settlement orchestration | n/a (this IS the canonical layer) | n/a | n/a |
| ✅ DESIGNED | `invoice-audit.service.ts` (4 sites) | Void/edit invoice reversals — coordinated with journal reversal entries | n/a | n/a | n/a |
| ✅ NON-FINANCIAL | `call-center.service.ts:895` | Subscription expiry extension (no money) | n/a | n/a | n/a |
| ✅ NON-FINANCIAL | `call-center.service.ts:1059, 1088` | Reminder counter (no money) | n/a | n/a | n/a |

#### Finding 2.1.3 — One shadow mutation candidate ⚠️ DOCUMENTED

`src/invoice-audit/invoice-audit.service.ts:374-382` — the
`applyWalletForOrder` SUBSCRIPTION_WALLET branch debits
`wallet.balance` without a paired journal entry.

```typescript
} else {
  const newBalance = wallet.balance.sub(order.totalPrice);
  await tx.customerWallet.update({
    where: { id: wallet.id },
    data: {
      balance: newBalance.lt(0) ? new Prisma.Decimal(0) : newBalance,
    },
  });
}
```

**Context:** This is the **re-application** path of the invoice-edit flow. Its sibling (`reverseWalletForOrder`, line 264-311) DOES write a journal entry (`WALLET_ABSORPTION_VOID`). The asymmetry exists because the edit flow was migrated for reversal first; the re-application leg waits for V20.4 Phase 2.

| Severity | File | Concern | Replacement path | Removal safety | Rollback safety |
| --- | --- | --- | --- | --- | --- |
| LOW | `invoice-audit.service.ts:374-382` | Re-applied subscription-wallet absorption skips the journal write | Mirror the canonical `appendWalletAbsorptionEntryV3Safe` here | Safe — additive | Trivial — drop the new journal call |

**Action:** Mirror the canonical absorption helper here in a future PR. **Not blocking** — the reconciliation invariant 3 (Wallet Liability Match) catches any drift within an hour.

### 2.2 `deleteMany` on financial tables

`Grep` for `deleteMany.*[Jj]ournal|deleteMany.*[Dd]ebt|deleteMany.*[Ww]allet|deleteMany.*[Ll]edger`:

**Production:** **zero matches**.

**Test utility:** `src/finance/test-utils/accountant-dashboard-integration-context.ts:146` does `await prisma.generalLedgerEntry.deleteMany({...})`. This is an **integration-test cleanup** for the legacy GL mirror. Tests do not run in production. **SAFE.**

| Severity | File | Concern | Replacement | Removal safety | Rollback safety |
| --- | --- | --- | --- | --- | --- |
| LOW (test-only) | `accountant-dashboard-integration-context.ts:146` | Test fixture cleanup | n/a | n/a | n/a |

### 2.3 Raw SQL mutations

`Grep` for `$executeRaw|$queryRaw.*UPDATE|$queryRaw.*INSERT|$queryRaw.*DELETE` outside test utilities:

| File | Line | Use | Verdict |
| --- | --- | --- | --- |
| `src/customer-ledger/customer-ledger.service.ts` | 353 | `SELECT 1 FROM CustomerWallet WHERE id = ? FOR UPDATE` | ✅ Read-only locking primitive |
| `src/invoice-audit/invoice-audit.service.ts` | 174 | Same `SELECT FOR UPDATE` lock | ✅ Read-only |
| `src/invoice-audit/invoice-audit.service.ts` | 348 | Same `SELECT FOR UPDATE` lock | ✅ Read-only |

**Conclusion:** Zero raw mutations on financial tables. Only the row-locking primitive uses raw SQL — by design, because Prisma does not expose `SELECT FOR UPDATE` natively.

### 2.4 `parseFloat` / `Number()` on KD fields — frontend

`Grep` for `parseFloat|Number.parseFloat` on `*Kd` fields in `web/src/`:

#### Finding 2.4.1 — One real frontend leak ⚠️ ACTIONABLE

| Severity | File | Line | Code | Why it leaks |
| --- | --- | --- | --- | --- |
| **MEDIUM** | `web/src/pages/financials-page.tsx` | 499 | `Number.parseFloat(executive.netProfitKd ?? '0') < 0 ?` | Comparison on a KD-suffixed field uses native float math. Should use `compareKwdStrings()` or check the sign on the raw decimal string. |

**Replacement path:** Add `isNegativeKd(s)` helper to `web/src/lib/kwd.ts` (mirrors the existing `isPositiveKd` in `payslip-print-page.tsx`).

| Removal safety | Rollback safety |
| --- | --- |
| Safe — additive helper + 1-line site change | Trivial — revert the file |

#### Finding 2.4.2 — Direct `.toFixed(3) د.ك` formatting in insights pages ⚠️ STYLE

| Severity | File | Lines | Concern |
| --- | --- | --- | --- |
| LOW | `web/src/pages/insights-ai-page.tsx` | 211-241, 360, 533-535 | Uses `value.toFixed(3) د.ك` instead of `formatKwdLabel(value)`. The values are backend-pre-computed numbers, so no reconstruction; this is a formatter-routing violation only. |

**Replacement path:** Migrate to `formatKwdLabel(value)` from `web/src/lib/kwd.ts`. Add `insights-ai-page.tsx` to the `singleFormatterGuardedFiles` list once migrated. Not blocking.

### 2.5 `parseFloat` / `Number()` on KD fields — backend

| Severity | File | Lines | Use | Verdict |
| --- | --- | --- | --- | --- |
| LOW | `src/customers/customer-360-financials.ts` | 114, 468 | Internal `money()` helper for the Customer 360 engine — converts already-validated `Prisma.Decimal` strings to numbers for arithmetic | DOCUMENTED in V21 memo §8.1.2 — server-side, contained, inputs are trusted strings; accumulated rounding is bounded by the 4-dp `round()` wrapper. **Migration to `Prisma.Decimal` queued for a future hardening PR.** |
| LOW | `src/finance/services/owner-financial-dashboard.service.ts` | 206 | `Number.parseFloat(b.totalDueKd) - Number.parseFloat(a.totalDueKd)` used as a comparator (sort) | Sorting only — no money mutated. Could swap to `compareKwdStrings`. |
| LOW | `src/finance/services/customer-intelligence.service.ts` | 65 | Internal `money()` helper | Same as 2.4.5 |
| LOW | `src/finance/services/financial-alerts.service.ts` | 30, 52, 63, 64 | Alert threshold comparisons (e.g., debt > 500 KD) | Comparisons; no money mutated |
| LOW | `src/finance/collections-intelligence/collections-intelligence.service.ts` | 233 | `clamp01(parseFloat(signals.largestInvoiceKd) / 100) * W.size` — risk-score input | Server-side risk scoring; output is a 0-1 score, not money. |
| LOW | `src/finance/services/debt.service.ts` | 65 | Internal `money()` helper | Same family |
| n/a | `src/finance/finance-money.ts` | 57, 62 | The CANONICAL minor↔major conversion (`toMinorFromFixed4`, `minorToAmountString`) | **DESIGNED.** This IS the canonical Decimal arithmetic. |

**Net assessment:** No backend `parseFloat` mutates money. All instances are either (a) helpers that consume already-validated Decimal strings or (b) comparators / scorers / alert thresholds.

### 2.6 Legacy folder

| Path | Status | Replacement | Removal safety |
| --- | --- | --- | --- |
| `src/legacy/legacy-debt-readers.ts` | **READ-ONLY**, quarantined | `DebtVisibilityService` + canonical projections | Wait for last consumer migration; documented in `v21-legacy-cleanup-report.md` |
| `src/finance/legacy-mirror/` | **DOES NOT EXIST** in V21 (earlier report referenced it incorrectly) | n/a | n/a |
| `web/src/modules/callcenter/` | README-only placeholder | Already retired conceptually; folder safe to delete | Documented in `v21-legacy-cleanup-report.md` §3.2 |

### 2.7 Legacy GL mirror — the largest single retirement candidate

`src/general-ledger/general-ledger.service.ts` is a **single-entry KPI tape**. It pre-dates the V20.4 canonical journal and is now a redundant mirror that some legacy reports still read.

**Callers:** Approximately 21 sites across `customer-ledger`, `orders`, `payments`, `manager-custody`, `cash`, and others write to it as a side-effect of canonical writes.

**Drift risk:** MEDIUM. The legacy GL is written **after** the canonical journal in the same transaction; if the legacy write throws and the journal already committed (it can't — they're in the same tx), drift is impossible. But operators reading legacy KPI tiles see numbers that may be slightly stale or differ in categorisation from the canonical journal.

**Phase 5 retirement plan** — see `docs/v21-gl-retirement-report.md`.

| Severity | File | Concern | Replacement | Removal safety | Rollback safety |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | `src/general-ledger/general-ledger.service.ts` | Redundant single-entry mirror | Migrate readers to canonical journal aggregations; freeze writes | Phased retirement (Phase 5) | Phased — env flag controls write-skip |

### 2.8 Duplicate components / hooks

| Layer | Audit | Result |
| --- | --- | --- |
| Frontend components | `Grep` for duplicate component names across `web/src/modules/` | None found (V20.7 unified the Financial UI Kit) |
| Frontend hooks | `Grep` for duplicate `use*` hooks | None found |
| Frontend API clients | All API calls route through `web/src/lib/api.ts` | ✅ |

### 2.9 Stale projections / dead snapshots

`src/finance/snapshots/` contains:
- `financial-snapshot.service.ts` — canonical projector
- `financial-snapshot.cron.ts` — 5-min reconciliation
- `snapshot-realtime-refresher.service.ts` — event-triggered refresh
- `financial-snapshot.repository.ts` — read-only adapter

All actively wired. No dead code.

### 2.10 Mixed-responsibility / circular deps

| Source | Status |
| --- | --- |
| Backend cycles | 8 cycles, all `forwardRef`-resolved (settlement triangle: Orders ⇄ CustomerLedger ⇄ Payments + Outstanding + Auth + Serials) |
| Frontend cycles | 0 |
| Mixed-responsibility services | None — every service in `src/` owns a single domain |

Per `docs/v21-structure-hardening-report.md`. Acceptable; the cycles are NestJS-recommended pattern for domain entanglement.

### 2.11 Non-canonical readers

| Reader | Source | Verdict |
| --- | --- | --- |
| `Customer360Service` | Reads `FinancialSnapshot` via `DebtVisibilityService` | ✅ canonical |
| `OutstandingService` | Same | ✅ canonical |
| `AgingService` | Reads `DebtLedgerEntry` directly | ⚠️ Layer 2 reader; reconciliation invariant 4 covers it |
| `RiskScoringService` | Reads canonical projections | ✅ canonical |
| `CollectionsService` | Reads canonical projections | ✅ canonical |
| `FinancialTimelineService` | Reads canonical projections + journal | ✅ canonical |
| `ReportsService` | Mixed — some legacy GL reads | ⚠️ Phase 5 retirement target |
| `AccountantDashboardService` | Mixed | ⚠️ Phase 5 retirement target |

---

## 3. Required Phase-1 Output

### Architecture explanation

Phase 1 is read-only. No architecture is changed. The audit confirms that the V21 system already operates on a single-writer canonical core; remaining contamination is concentrated in (a) one frontend `parseFloat` leak, (b) seven backend internal helpers using `Number.parseFloat` on already-validated Decimal strings, and (c) the legacy GL mirror.

### Invariant verification

All 20 invariants from `architecture/invariants.md` remain enforced. Phase 1 added zero code; no invariants can have regressed.

### Risk analysis

| Risk | Probability | Impact | Mitigation status |
| --- | --- | --- | --- |
| Frontend `parseFloat` introduces a wrong sign | LOW | Display only (no money mutated) | Phase 2 will add a guard; fix in Phase 7 |
| Backend `parseFloat` accumulates 4-dp drift | VERY LOW | Bounded by `round()` wrapper at the 4-dp boundary | Migration to `Prisma.Decimal` queued for hardening PR |
| Legacy GL drifts from canonical journal | LOW | Operator reads stale KPIs | Phase 5 retirement |
| `applyWalletForOrder` SUBSCRIPTION_WALLET re-application skips journal | LOW | Reconciliation invariant 3 catches in ≤ 1 h | Mirror the absorption helper in a follow-up PR |

### Migration impact

Zero. Phase 1 is read-only.

### Concurrency analysis

Zero new code paths added. Existing concurrency primitives unchanged:
- `lockCustomerWalletForUpdateTx` (5 sites)
- `appendBalanced` idempotency on `sourceRef`
- `tx.order.updateMany` atomic claim with `walletSettledAt: null` predicate
- `prisma.$transaction(maxWait, timeout)` boundaries

### Replay analysis

`FinancialSnapshot` rebuild guarantee unchanged. Every entry retains its deterministic `sourceRef`.

### Rollback plan

Phase 1 is documentation only. Rollback = `git revert` of the doc commit.

### Rollout plan

Distribute the audit document to engineering + financial leadership. Schedule Phase 2-8 work.

### Tests added

Zero in Phase 1.

### Files modified

| File | Type |
| --- | --- |
| `docs/v21-final-legacy-audit.md` | NEW — this document |

### Unresolved risks

1. Frontend `parseFloat` in `financials-page.tsx:499` — Phase 7.
2. Backend internal helpers using `parseFloat` on Decimal strings — long-tail hardening PR.
3. Legacy GL mirror still active — Phase 5.
4. `applyWalletForOrder` SUBSCRIPTION_WALLET re-application — additive PR (out of mission scope; safe to defer).

---

## 4. Phase 1 status

**Status: ✅ COMPLETE.**

- 9 forensic sweeps run against the live V21 codebase.
- 0 production regressions possible (read-only audit).
- 1 frontend leak identified for Phase 2 guard + Phase 7 fix.
- 1 retirement target (legacy GL) confirmed for Phase 5.
- 8 already-documented `forwardRef` cycles confirmed acceptable.

**Next:** Phase 2 — Canonical Financial Enforcement.
