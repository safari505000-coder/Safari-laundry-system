# V24 Station 1 — Discovery Report (Read-Only Audit)

> Generated before any code modification. Pure inventory + classification.
> Scope: catalogue what V24 ("Financial Authority") must touch and prove
> what V23.x already locked in.

---

## Executive Summary — Where We Stand

| Pillar | Maturity | Notes |
|---|---|---|
| **Wire DTOs (money-bearing)** | 🟢 95% canonical | 22 of 24 money-bearing DTOs already use `string` (4dp KWD). 2 outliers — both config/threshold fields, not customer balances. |
| **Backend Snapshot Service** | 🟢 Mature (V20.4) | `financial-snapshot.service.ts` is the canonical projector. Persisted to `FinancialSnapshot` table with `schemaVersion=2`. Backed by cron + realtime refresher. |
| **Backend Reconciliation Engine** | 🟡 Mature but **incomplete** | 4 invariants live (Trial Balance, A=L+E, Wallet, AR). **Missing**: per-customer Snapshot↔Ledger invariant. **Missing**: lock-in test that fails build on drift > 0. |
| **FE Math Helpers** | 🔴 5 helpers violate "Don't Calculate, Just Ask" | `sales-debt-analytics`, `sales-debt-insights`, `expense-analytics`, `expense-insights`, `weekly-expense-report` — all aggregate raw rows in the browser. |
| **Purity Guard** | 🟢 Robust | `v23-1-canonical-money-purity-guard.test.ts` blocks `parseFloat`/`Number()`/`+`/`-` on `*Kd` fields. **Gap**: doesn't catch math under non-`Kd` aliases (e.g. `const total = sum + diff` where `sum` is a money value). |

**V24 Station 1 is feasible in 3 surgical waves.** No architectural surprises. The hard work was V20–V23.

---

## Section 1 — Backend DTO Wire Surface (Money-Bearing)

### 1.1 Inventory

164 total `*.dto.ts` files. Filtered to money-bearing (any `*Kd:` field declaration): **24 files**.

| DTO File | `number` fields | `string` fields | Verdict |
|---|---:|---:|---|
| `call-center/dto/customer-ledger.dto.ts` | 0 | 30 | 🟢 Canonical |
| `call-center/dto/customer-subscription.dto.ts` | 0 | 2 | 🟢 Canonical |
| `call-center/dto/daily-collections.dto.ts` | 0 | 7 | 🟢 Canonical |
| `call-center/dto/daily-collections-reconciliation.dto.ts` | 0 | 7 | 🟢 Canonical |
| `call-center/dto/debt-conversion-options.dto.ts` | 0 | 14 | 🟢 Canonical |
| `call-center/dto/debt-recovery-report.dto.ts` | 0 | 9 | 🟢 Canonical |
| `call-center/dto/operations-summary.dto.ts` | 0 | 5 | 🟢 Canonical |
| `call-center/dto/record-partial-debt-payment.dto.ts` | 0 | 2 | 🟢 Canonical |
| `call-center/dto/subscription-rollover-preview.dto.ts` | 0 | 3 | 🟢 Canonical |
| `cash-intelligence/dto/cash-intelligence-analysis.dto.ts` | 0 | 1 | 🟢 Canonical |
| `cash-monitor/dto/cash-classified.dto.ts` | **1** | 1 | 🟡 `smallAmountFloorKd: number` (config threshold) |
| `cash-monitor/dto/cash-dashboard.dto.ts` | 0 | 1 | 🟢 Canonical |
| `cash-monitor/dto/cash-exposure.dto.ts` | 0 | 0 (uses `amount: string`) | 🟢 Canonical |
| `cash-monitor/dto/diagnostics.dto.ts` | 0 | 0 | 🟢 N/A |
| `expenses/dto/expenses-summary.dto.ts` | 0 | 9 | 🟢 Canonical |
| `finance/dto/cash-reconciliation.dto.ts` | 0 | 5 | 🟢 Canonical |
| `finance/dto/driver-balance.dto.ts` | 0 | 5 | 🟢 Canonical |
| `finance/dto/driver-cash-trace.dto.ts` | 0 | 15 | 🟢 Canonical |
| `finance/dto/open-debt-by-issuer.dto.ts` | 0 | 2 | 🟢 Canonical |
| `finance/dto/owner-financial-dashboard.dto.ts` | 0 | 4 | 🟢 Canonical |
| `finance/dto/unpaid-invoices.dto.ts` | 0 | 20 | 🟢 Canonical |
| `finance/outstanding/dto/outstanding-row.dto.ts` | 0 | 6 | 🟢 Canonical (V23.3) |
| `payment-method-fees/dto/update-payment-method-fees.dto.ts` | **1** | 0 | 🟡 `knetFlatKd: number` (input/config) |
| `serials/dto/serials.dto.ts` | 0 | 1 | 🟢 Canonical |

**Verdict: 22 fully canonical, 2 minor outliers (both threshold/config, not customer balances).**

### 1.2 Wire Types Files

| File | `number` | `string` | Verdict |
|---|---:|---:|---|
| `collections-workflow/collections-workflow.types.ts` | 0 | 0 | 🟢 |
| `customer-ledger/subscription-settlement.types.ts` | 0 | 6 | 🟢 |
| `customers/customer-360.types.ts` | 0 | 18 | 🟢 |
| `finance/aging/aging.types.ts` | 0 | 5 | 🟢 |
| `finance/debt-visibility/debt-visibility.types.ts` | 0 | 11 | 🟢 |
| `finance/snapshots/financial-snapshot.types.ts` | 0 | 0 (Decimal internal) | 🟢 |

### 1.3 V24 Wave A Targets (DTOs)

| # | File | Action | Justification |
|---|---|---|---|
| A1 | `cash-monitor/dto/cash-classified.dto.ts` | Convert `smallAmountFloorKd: number` → `string` (4dp) **OR** rename to `smallAmountFloorThreshold: string` and route through canonical config | Threshold values still flow into FE comparisons; once they're string the purity guard covers them too. |
| A2 | `payment-method-fees/dto/update-payment-method-fees.dto.ts` | Convert `knetFlatKd?: number` → `string` (4dp) on the **response** path. Keep `number` on the **input** path or accept both via a transformer. | Input DTOs may use `number`; the read shape sent back to the FE must be canonical. |
| A3 | **No other DTO changes needed** for Wave A — surface is already 95% clean. | | |

---

## Section 2 — Frontend Helpers (web/src/lib)

### 2.1 Inventory + Profile

| File | Bytes | Exports | Kd refs | Math-lines | Classification |
|---|---:|---:|---:|---:|---|
| `kwd.ts` | 8898 | 17 | 9 | 68 | 🟢 **Canonical engine** (V23.x certified, allowlisted, source of truth) |
| `arabic-customer-text.ts` | 1411 | 4 | 2 | 0 | 🟢 Display-only (text formatter) |
| `branch-list-refresh.ts` | 246 | 2 | 0 | 1 | 🟢 Refresh signal (no math) |
| `brand.ts` | 2054 | 3 | 0 | 18 | 🟢 UI/style helpers |
| `executive-summary-refresh.ts` | 353 | 2 | 0 | 2 | 🟢 Refresh signal |
| `expense-filters.ts` | 1307 | 4 | 0 | 0 | 🟢 Filter predicates |
| `expense-analytics.ts` | 3059 | 5 | 0 | 5 | 🔴 **Aggregates raw expenses on FE** |
| `expense-insights.ts` | 5085 | 3 | 0 | 20 | 🔴 **Builds insights from raw rows on FE** |
| `knet-fee-estimate.ts` | 1320 | 2 | 8 | 8 | 🟡 **Allowlisted (V21)** — client-side estimate, server canonicalizes on capture |
| `knet-statement-parse.ts` | 8218 | 5 | 1 | 31 | 🟢 Bank statement **parser** (text→struct, not financial math) |
| `notify.ts` | 3657 | 2 | 0 | 24 | 🟢 Notification UI helpers |
| `order-scan.ts` | 549 | 1 | 0 | 3 | 🟢 Scan handler |
| `payroll-roster-sort.ts` | 1408 | 3 | 0 | 5 | 🟢 Sort comparator |
| `safari-ui.ts` | 1011 | 3 | 0 | 10 | 🟢 UI helpers |
| `sales-debt-analytics.ts` | 7312 | 7 | 4 | 17 | 🔴 **Aggregates orders → SalesDebt totals on FE** |
| `sales-debt-insights.ts` | 4412 | 4 | 0 | 16 | 🔴 **Builds debt insights from raw rows on FE** |
| `utils.ts` | 166 | 1 | 0 | 1 | 🟢 cn helper |
| `weekly-expense-report.ts` | 2590 | 5 | 0 | 7 | 🔴 **Assembles weekly report on FE** |
| `web/src/utils/finance-engine.ts` | (POS price builder) | — | many | many | 🟡 **Allowlisted (V21)** — POS cart builder; backend canonicalizes on `pos-checkout-bundle` |

### 2.2 V24 Wave B Targets (5 helpers + 5 consumers)

| # | FE Helper | Consumers | Backend Replacement |
|---|---|---|---|
| B1 | `lib/sales-debt-analytics.ts` | `pages/sales-summary-report-page.tsx`, `components/reports/sales-debt-insights-panel.tsx`, `lib/sales-debt-insights.ts` | New: `GET /api/finance/sales-debt-analytics?from=&to=&groupBy=branch\|driver` returns the `SalesDebtAnalytics` shape pre-aggregated, all `*Kd` as canonical strings. |
| B2 | `lib/sales-debt-insights.ts` | `pages/sales-summary-report-page.tsx`, `components/reports/sales-debt-insights-panel.tsx` | Fold into B1's response (insights computed alongside totals). |
| B3 | `lib/expense-analytics.ts` | `lib/expense-insights.ts`, `lib/weekly-expense-report.ts` | Existing `GET /api/finance/expenses-summary` already aggregates — verify it covers the analytics shape; if not, extend its DTO. |
| B4 | `lib/expense-insights.ts` | `lib/weekly-expense-report.ts` | Move insight generation to backend: extend `expenses-summary` response with `insights[]`. |
| B5 | `lib/weekly-expense-report.ts` | `components/expenses/weekly-expense-report-actions.tsx` | New: `GET /api/finance/expenses-weekly-report?range=...` returns the printable assembly. |

**Total purge surface: 5 lib files (delete or thin) + 5 consumer files (rewire to backend).**

---

## Section 3 — Reconciliation Engine (Backend)

### 3.1 Current Coverage (`reconciliation.service.ts`)

| # | Invariant | Compares | Tolerance | Cron | HTTP |
|---|---|---|---|---|---|
| 1 | TRIAL_BALANCE | Σ DR vs Σ CR over `JournalLine` | 0.001 KD | ✅ Hourly (env-gated) | ✅ `GET /api/finance/reconciliation/run` |
| 2 | ASSETS_EQ_LIAB_PLUS_EQUITY | A vs L + (E + Rev − Exp) | 0.001 KD | ✅ | ✅ |
| 3 | WALLET_LIABILITY_MATCH | Σ Journal Wallet net credit vs Σ `CustomerWallet.balance` | 0.001 KD | ✅ | ✅ |
| 4 | AR_INTEGRITY | Σ Journal AR debit vs Σ open invoice `totalPrice` (legacy fallback) | 0.001 KD | ✅ | ✅ |

Drift detection emits `finance.drift.detected` event + warn log. **No automated build failure on drift.**

### 3.2 V24 Wave C Targets (Reconciliation Baseline)

| # | Gap | Proposed Action |
|---|---|---|
| C1 | **Snapshot ↔ Ledger invariant missing.** No invariant compares `Σ FinancialSnapshot.canonicalDebtKd` vs `Σ Journal AR per customer`. | Add 5th invariant `SNAPSHOT_AR_MATCH`: per-customer compare `snapshot.canonicalDebtKd` vs derived per-customer journal AR; aggregate delta. |
| C2 | **No build-failing lock-in test.** Cron logs and emits but build never fails on drift. | Add `src/finance/reconciliation/v24-reconciliation-baseline.spec.ts`: runs all 5 invariants against a seeded clean fixture; asserts `report.driftCount === 0` AND `report.ok === true`. |
| C3 | **Tolerance reported in 3dp legacy.** `TOLERANCE_KD = 0.001` while V23.3 standardized 4dp display. | Either tighten to `0.0001` (4dp parity) or add a `toleranceRationale` field documenting why 0.001 is the runtime band. |
| C4 | **No drift catalogue / runbook.** When drift fires, operators have no mapping from invariant → root cause → remediation. | Add `docs/v24-reconciliation-runbook.md` with one row per invariant, common drift causes, and the SQL/script to debug each. |

---

## Section 4 — Purity Guard (Implicit Governance)

### 4.1 Current Coverage (`web/src/lib/v23-1-canonical-money-purity-guard.test.ts`)

✅ Blocks: `parseFloat(*Kd)`, `Number(*Kd)`, `parseInt(*Kd)`, `+ *Kd` (unary), `*Kd + *Kd`, `*Kd - *Kd`.
✅ Scans both `web/src` and `src/` (backend).
✅ Maintains `ALLOW_LIST` with documented exceptions.

### 4.2 V24 Wave D Targets (Implicit Governance Hardening)

| # | Gap | Proposed Action |
|---|---|---|
| D1 | **Math under non-Kd aliases escapes detection.** A FE helper that does `const sales = amount(order.totalPrice); const debt = sales - collected;` slips through because `sales`/`debt` aren't named `*Kd`. | Add a heuristic: any function in `web/src` declared with parameters of type `OrderRow`, `ExpenseRow`, `InvoiceRow` (or any wire row type) must NOT contain `+`, `-`, `*` operators on its locals. Allowlist the known POS engine. |
| D2 | **No "DTO must ship canonical" lock.** Nothing prevents a future PR from reintroducing `someAmountKd: number` in a DTO. | Add `src/finance/v24-canonical-dto-purity.spec.ts`: scans all `*.dto.ts` and `*.types.ts` under `src/`; fails if any wire-output type declares `*Kd: number`. |
| D3 | **No "FE imports backend math" lock.** Nothing prevents reintroducing `lib/sales-debt-analytics.ts`-style helpers. | Once Wave B deletes the 5 helpers, add a lock that fails if a file matching `web/src/lib/*-analytics.ts` or `*-insights.ts` is reintroduced without a corresponding backend endpoint reference. |

---

## Section 5 — Recommended Execution Order

```
Wave A — DTO Authority (Backend, ~2 files)
   └─ Convert 2 outlier DTOs to string-typed Kd
   └─ Add v24-canonical-dto-purity.spec.ts (Wave D2)
   └─ Verify: tsc + jest → 0 errors

Wave C — Reconciliation Baseline (Backend, ~2 files)   ⬅ EARLY for guardrail-first
   └─ Add 5th invariant SNAPSHOT_AR_MATCH
   └─ Add v24-reconciliation-baseline.spec.ts (lock-in test)
   └─ Verify: jest → all green, drift = 0 on seeded fixtures

Wave B — Frontend Purge (Backend new endpoints + FE rewrite, ~12 files)
   └─ B1+B2: New /finance/sales-debt-analytics endpoint + DTO
   └─ B3+B4+B5: Extend /finance/expenses-summary OR add /finance/expenses-weekly-report
   └─ Delete 5 FE helpers + rewire 5 consumer pages
   └─ Add Wave D1 + D3 purity guards
   └─ Verify: tsc + vitest + jest → 100% green

Wave Lock — Charter
   └─ Update docs/v23-1-architectural-purge-scorecard.md with V24 Station 1 report
   └─ Tag the commit set "V24-Station-1-Financial-Authority"
```

**Estimated touch count:**
- Wave A: 2 DTO files + 1 new lock-in spec = 3 files
- Wave C: 1 service edit + 1 new spec + 1 runbook = 3 files
- Wave B: 2-3 new backend endpoints (controller + service + DTO) + 5 deleted FE helpers + 5 rewired consumers + 2 new purity guards = ~15-20 files

**Total V24 Station 1 ≈ 22-26 files.**

---

## Section 6 — Red Flags Surfaced During Discovery

1. **`AR_INTEGRITY` invariant uses legacy fallback.** It compares journal AR vs `Σ totalPrice WHERE cashStatus=UNPAID` — which is **not partial-payment-aware**. The invariant's own comment admits this. Consider replacing with `Σ FinancialSnapshot.canonicalDebtKd` once Wave C ships SNAPSHOT_AR_MATCH.

2. **`smallAmountFloorKd: number` in `cash-classified.dto.ts`** is read by the FE classifier and used in comparisons. If the FE imports it, it's likely doing `if (amount < smallAmountFloorKd)` — which technically obeys the purity guard (no `+`/`-`/`parseFloat`) but compares two semantically different scales. Worth converting to string + using `compareKwdStrings` on the FE.

3. **No per-customer reconciliation today.** Aggregate invariants can hide cancellation: customer A drifts +5 KD, customer B drifts −5 KD, aggregate delta = 0. Wave C's per-customer SNAPSHOT_AR_MATCH closes this gap.

4. **Cron is env-gated to off by default** (`RECONCILIATION_CRON_ENABLED`). Verify production has it enabled — otherwise reconciliation is dormant.

---

**Discovery complete. Ready to execute on user's chosen scope.**
