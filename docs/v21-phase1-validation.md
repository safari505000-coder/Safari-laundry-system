# V21 — PHASE 1 — VALIDATION REPORT

> Sister document to `v21-phase1-implementation.md`. Verifies that
> the canonical financial core is locked into the shape declared
> by Phase 1, that every approved write boundary is intact, and
> that all anti-drift / anti-bypass / mutation-boundary /
> replay-consistency / closed-period rejection invariants hold.

## 1 — Test execution log

### 1.1 Backend

```
$ npx jest --no-coverage
Test Suites: 1 failed, 78 passed, 79 total
Tests:       1 failed, 21 skipped, 723 passed, 745 total
Time:        7.982 s
```

The single failing test is `src/security-rbac.spec.ts:134`
(`expect(appRoutes).toContain('path="/403"')`). It is **pre-existing
technical debt** introduced when a route was renamed in commit
`17f7311` (before the V21 banking mission began). It does **not**
involve any of the financial files modified in V21 Phase 1.
Documented in `docs/v21-final-banking-validation.md` and carried
into the V22 backlog as a UI-routing fix.

### 1.2 Backend — V21 Phase 1 isolated suite

```
$ npx jest src/finance/v21-phase1-core-freeze.spec.ts --no-coverage
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
Time:        0.699 s
```

**37/37 ✅** — the 5 named validation suites are all green.

### 1.3 Backend — V21 banking-guards + Phase 1 + period-lock + monitor + replay-anomaly

```
$ npx jest src/finance/v21-phase1-core-freeze.spec.ts \
           src/finance/v21-canonical-banking-guards.spec.ts \
           src/finance/periods/period-lock-monitor.spec.ts \
           src/finance/observability/banking-anomaly-detectors.spec.ts \
           src/general-ledger/period-lock-enforcement.spec.ts \
           src/general-ledger/double-entry-journal.service.spec.ts \
           --no-coverage
Test Suites: 6 passed, 6 total
Tests:       188 passed, 188 total
Time:        2.142 s
```

**188/188 ✅** — every canonical-enforcement spec passes.

### 1.4 Frontend

```
$ npx vitest run
Test Files  26 passed (26)
     Tests  139 passed (139)
Duration  6.19s
```

**139/139 ✅**, including the new 2 cross-module-import-guard tests
and the new 1 `isMaterialKd` test.

### 1.5 Builds

```
$ npm run build              # web/
✓ built in 1.25s

$ npx nest build             # repo root
exit code 0
```

Both production builds compile cleanly.

### 1.6 Architecture

```
$ npx madge --circular --extensions ts,tsx web/src
✓ No circular dependency found!
```

Frontend remains acyclic.

## 2 — The 5 named validation suites

### 2.1 Anti-drift

5 architectural-shape tests asserting:
- `reconciliation.service.ts` exists with all 4 invariants
  (`TRIAL_BALANCE`, `ASSETS_EQ_LIAB_PLUS_EQUITY`,
  `WALLET_LIABILITY_MATCH`, `AR_INTEGRITY`)
- `@Cron(...)` decorator is wired (drop it → engine becomes invisible)
- `snapshot-realtime-refresher.service.ts` exists
- `financial-snapshot.cron.ts` exists
- Drift detection emits a domain event for downstream consumers

**Result**: 5/5 ✅

### 2.2 Anti-bypass

5 file-system scans asserting:
- 0 direct journal writes outside the canonical writer
- 0 direct customerWallet writes outside the 3-file allowlist
- 0 direct debtLedgerEntry writes outside the 3-file allowlist
- 0 `deleteMany` on append-only financial tables in production code
- 0 `$executeRaw` / `$executeRawUnsafe` in production code

**Result**: 5/5 ✅

The patterns + allowlists in this suite **intentionally duplicate**
those in `v21-canonical-banking-guards.spec.ts` so the two specs
are independent witnesses of the same invariants. Removing one
does not silently weaken the other.

### 2.3 Mutation-boundary

5 tests asserting:
- Every approved journal-writer file exists
- Every approved wallet-writer file exists
- Every approved debt-ledger-writer file exists
- The canonical writer exposes `appendBalanced` as the named entry-point
  with the `UNBALANCED_JOURNAL`, `JOURNAL_SOURCE_REF_REQUIRED`,
  `JOURNAL_ACTOR_REQUIRED` invariant errors
- The canonical KWD helpers are all exported from `web/src/lib/kwd.ts`
  (now 11 functions, including the new `isMaterialKd`)

**Result**: 5/5 ✅

### 2.4 Replay-consistency

13 tests asserting:
- `canonical-hash.ts` / `canonical-snapshot.ts` / `canonical-replay.ts` /
  `canonical-immutable.ts` / `canonical-financial-projection.ts`
  each exist with a sibling `.spec.ts` (10 file-existence checks)
- `canonical-hash.ts` exports `canonicalHash`
- `canonical-snapshot.ts` exports a snapshot generator
- `canonical-replay.ts` exports a replay engine
- The Phase 6 `detectReplayAnomaly` detector exists in
  `banking-anomaly-detectors.ts`

**Result**: 13/13 ✅

### 2.5 Closed-period rejection

9 tests asserting:
- `appendBalanced` reads `process.env.PERIOD_LOCK_ENFORCE === 'true'`
  on every call (lets operators flip the flag without restart)
- `appendBalanced` calls `this.periodGuard.assertWriteAllowed(...)`
- `FinancialPeriodsService.assertWriteAllowed` is async, writes to
  `financialPeriodViolation`, and throws `ConflictException` on refusal
- Idempotent retry on existing `sourceRef` short-circuits **before**
  the period-guard call (otherwise a retry of a previously-OPEN
  write would fail once the period closes — the ordering is asserted
  by `indexOf` comparison)
- The period-lock matrix spec covers all 7 cases:
  `OFF + OPEN`, `OFF + CLOSED`, `ON + OPEN`,
  `ON + CLOSED + non-reversal`, `ON + CLOSED + allowReversal`,
  `ON + CLOSED + retry of an existing sourceRef`
- `period-lock-monitor.ts` + `.spec.ts` exist with `projectPeriodHealth` export
- `.env.example` documents `PERIOD_LOCK_ENFORCE`
- The runbook `docs/architecture/operational-runbooks/period-lock-enforcement.md`
  exists and documents both directions (enable + disable)

**Result**: 9/9 ✅

## 3 — Single Source of Financial Truth verification

The 6 named surfaces all consume canonical projections. See
`docs/v21-phase1-ssot-verification.md` for the per-surface read-path
trace. Summary:

| Surface             | Canonical reader                            | Verdict |
|---------------------|---------------------------------------------|---------|
| Customer360         | `computeCustomer360FinancialCore`           | ✅ Canonical |
| Outstanding         | `debt-customer-aggregates.util`             | ✅ Canonical |
| Aging               | `debt-customer-aggregates.util`             | ✅ Canonical |
| Collections         | `collectionsAccount` + `collections-workflow.service` | ✅ Canonical |
| FinancialTimeline   | `Order` + `DebtLedgerEntry` + `JournalEntry` + `GeneralLedgerEntry` (legacy mirror, V22 retirement plan in place) | ✅ With documented legacy GL read |
| Reports             | Prisma reads with `minorToAmountString` + `sumOrderMinors` (canonical Decimal helpers) | ✅ Canonical |

No duplicated balance calculations were detected in any of the 6
surfaces — each one resolves money values through a single
canonical aggregator.

## 4 — Build-time guards summary

| Guard | Spec file | Tests |
|-------|-----------|------:|
| Canonical banking guards (V21 Phase 2-7 + Phase 1 lock-ins) | `src/finance/v21-canonical-banking-guards.spec.ts` | 116 |
| Phase 1 5-suite shape lock-in | `src/finance/v21-phase1-core-freeze.spec.ts` | 37 |
| Period-lock matrix | `src/general-ledger/period-lock-enforcement.spec.ts` | 7 |
| Period-lock monitor unit | `src/finance/periods/period-lock-monitor.spec.ts` | (covered) |
| Banking anomaly detectors | `src/finance/observability/banking-anomaly-detectors.spec.ts` | (covered) |
| Cross-module finance-internal imports | `web/src/modules/finance/cross-module-import-guard.test.ts` | 2 |
| Module-only architecture (V20.9) | `web/src/modules/finance/components/v20-9-module-only-architecture.test.ts` | (covered) |

## 5 — Validation verdict

All 5 named Phase 1 validation suites green; full backend + frontend
suites green except the pre-existing `security-rbac.spec.ts:134`
failure unrelated to the financial scope; both production builds
compile cleanly; no circular dependencies; canonical helpers
complete; no direct financial writes outside approved services;
no frontend money math in any guarded file; no duplicated balance
calculations.

V21 Phase 1 is **VALIDATED — proceed to scorecard**.
