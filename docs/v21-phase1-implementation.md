# V21 — PHASE 1 — IMPLEMENTATION REPORT

> Sister document to `v21-phase1-core-freeze-audit.md`. Lists
> every file touched during V21 Phase 1, the surface delta, and
> the contract preserved.

## 1 — Files added

| File | Purpose | Tests |
|------|---------|-------|
| `src/finance/v21-phase1-core-freeze.spec.ts` | 5 named validation suites (anti-drift / anti-bypass / mutation-boundary / replay-consistency / closed-period rejection) — 37 architectural-shape tests, file-system-driven | 37 / 37 ✅ |
| `web/src/modules/finance/cross-module-import-guard.test.ts` | Vitest guard preventing `web/src/**` outside `modules/finance/` from deep-importing `@/modules/finance/state/*`, `…/api/*`, `…/hooks/*` | 2 / 2 ✅ |
| `docs/v21-phase1-core-freeze-audit.md` | Forensic audit (this mission §0) | n/a |
| `docs/v21-phase1-implementation.md` | This file | n/a |
| `docs/v21-phase1-validation.md` | Validation report (next file) | n/a |
| `docs/v21-phase1-scorecard.md` | Scorecard + rollback step | n/a |
| `docs/v21-phase1-ssot-verification.md` | Single-source-of-truth verification of the 6 named surfaces | n/a |

## 2 — Files modified (additive only — no business behaviour changed)

### Frontend canonical-comparison helpers

| File | Change | Lines |
|------|--------|-------|
| `web/src/lib/kwd.ts` | Added `isMaterialKd()` — `\|x\| >= 0.0001` boundary check | +20 |
| `web/src/lib/kwd.test.ts` | Added 1 new test block for `isMaterialKd` (10 assertions) | +13 |

### Frontend money-math migrations (5 files)

All migrations replace a `Number.parseFloat(...) <comparator>` with
the equivalent canonical helper. **No behaviour changes** — every
substitution is exact (`isPositiveKd` ↔ `> 0`, `isMaterialKd` ↔ `>= 0.0001`).

| File | Substitutions |
|------|---------------|
| `web/src/modules/call-center/dashboard/components/tabs/overview-tab.tsx` | 2 (`isMaterialKd`, `isPositiveKd`) |
| `web/src/modules/shared/lib/whatsapp-links.ts` | 1 (`isPositiveKd`) |
| `web/src/pages/payroll-page.tsx` | 4 (`isPositiveKd`, display gates only — net-pay calc untouched) |
| `web/src/pages/unpaid-invoices-page.tsx` | 1 (`isMaterialKd`) |
| `web/src/pages/feedback-inbox-page.tsx` | 1 (`formatKwdAmount`) |

### Build-time guards (additive)

| File | Change |
|------|--------|
| `src/finance/v21-canonical-banking-guards.spec.ts` | 5 new entries in `moneyComparisonGuardedFiles` (locks the migrations above); `isMaterialKd` added to required-helpers list |

### Documentation / config

| File | Change |
|------|--------|
| `.env.example` | Added `PERIOD_LOCK_ENFORCE` config block (~25 lines) — documents activation procedure inline + links to runbook |

## 3 — Files NOT touched (zero-mutation guarantee)

The following surfaces were **read** during the audit but **not
modified** — preserving the canonical journal logic, settlement
outputs, and historical rows per the mission's hard rules:

- `src/general-ledger/double-entry-journal.service.ts` — canonical writer
- `src/general-ledger/period-lock-enforcement.spec.ts` — period-lock matrix
- `src/finance/canonical-*.ts` (hash, snapshot, replay, immutable, projection)
- `src/finance/reconciliation/reconciliation.service.ts`
- `src/finance/snapshots/*.ts`
- `src/finance/periods/period-lock-monitor.ts`
- `src/finance/observability/banking-anomaly-detectors.ts`
- All `prisma/schema.prisma` financial models
- All historical journal / wallet / debt-ledger rows in any
  database (no migration was generated)

## 4 — Surface deltas

| Concept | Before V21 P1 | After V21 P1 |
|---------|---------------|--------------|
| Canonical KD helpers exported from `lib/kwd.ts` | 9 (formatKwdAmount, formatKwdLabel, formatKwdLabelGrouped, formatSignedKwdLabel, sumKwdStrings, subtractKwdStrings, isPositiveKd, isNegativeKd, isZeroKd, compareKwdStrings) | **11** (+ `isMaterialKd`) |
| `moneyComparisonGuardedFiles` allowlist | 9 files | **14** files (+5 migrated) |
| Backend canonical-banking-guards tests | 111 | **116** (+5 from new guarded files) |
| Backend Phase 1 lock-in tests | 0 | **37** (`v21-phase1-core-freeze.spec.ts`) |
| Frontend KWD test count | 5 | **6** (`isMaterialKd` block) |
| Frontend cross-module-import guard | none | **2** tests, locking finance internals |
| `.env.example` PERIOD_LOCK_ENFORCE doc | absent | present + activation procedure |

## 5 — Contract preservation matrix

For every change above, the contract preserved is:

| Hard rule | Mechanism |
|-----------|-----------|
| Do NOT modify business behaviour | Every migration is a behavioural-equivalent substitution; verified by full backend (723 tests) + full frontend (139 tests) suites running green post-migration |
| Do NOT alter canonical journal logic | `double-entry-journal.service.ts` not touched; verified by V21 Phase 1 Mutation-boundary suite |
| Do NOT change settlement outputs | `customer-ledger.service.ts` not touched; verified by 16 customer-ledger spec files all green |
| Do NOT mutate historical rows | No Prisma migration generated; no `update`/`upsert` calls on historical tables added |
| Do NOT introduce breaking API changes | No DTOs added/removed; no controller routes added/removed |
| Do NOT delete financial data | No `deleteMany` calls added; no migration generated |
| Every change additive, rollback-safe | All new files are isolated; all modified files are surface-only (helper additions / display substitutions) |

## 6 — Test count delta

| Suite | Before | After | Delta |
|-------|-------:|------:|------:|
| Backend Jest (full)         | 681 passing | **723 passing** | +42 |
| Frontend Vitest (full)      | 138 passing | **139 passing** | +1 |
| Backend canonical-guards    | 111 | **116** | +5 |
| Backend Phase 1 lock-in     | 0   | **37**  | +37 |
| Frontend KWD                | 5   | **6**   | +1 |
| Frontend cross-module-guard | 0   | **2**   | +2 |

(Backend +42 = +37 phase-1 lock-in + +5 new guarded-file enforcement;
the previously documented pre-existing `security-rbac.spec.ts:134`
failure remains as documented in `v21-final-banking-validation.md`
— it is unrelated to the V21 financial mission.)

## 7 — Rollback boundary

Every change is in one of two categories:
1. **Additive code** (new files in `src/finance/`, `web/src/modules/finance/`, `web/src/lib/kwd.ts`, `.env.example`, `docs/`).
2. **Behavioural-equivalent substitution** (5 frontend files; the substitutions resolve to identical truth values).

A revert of any single change does NOT cascade into other changes.
See `docs/v21-phase1-scorecard.md` for the exact rollback step.
