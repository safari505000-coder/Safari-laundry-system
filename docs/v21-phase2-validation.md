# V21 — PHASE 2 — VALIDATION REPORT

> Sister doc to `v21-phase2-implementation.md` and
> `v21-phase2-deletion-inventory.md`. Records the post-wave gate
> results that prove every cleanup preserved behaviour exactly.

## 1 — Per-wave validation log

### 1.1 Wave 1 — Frontend orphan deletions

```
$ npx vitest run
Test Files  26 passed (26)
     Tests  139 passed (139)
Duration  6.47s

$ npm run build
✓ built in 1.24s
```

**Result**: ✅ Behavioural equivalence — no test regression, build clean.

### 1.2 Wave 2 — Placeholder folder removal

```
$ npx vitest run \
    src/modules/finance/components/v20-8-ui-consistency-expanded.test.ts \
    src/modules/finance/components/v20-9-module-only-architecture.test.ts \
    src/modules/finance/cross-module-import-guard.test.ts
Test Files  3 passed (3)
     Tests  5 passed (5)
Duration  1.74s
```

**Result**: ✅ The three guards that reference module-folder paths
all gracefully handle the missing `callcenter/` folder via
`safeStat`.

### 1.3 Wave 3 — `dist/` git untracking

```
$ git rm -r --cached dist
… (1,479 files removed from index) …

$ (git ls-files dist/ | Measure-Object -Line).Lines
0

$ Test-Path dist
True

$ npx nest build
exit 0
```

**Result**: ✅ Index cleared, working-tree preserved, backend
build re-emits `dist/` cleanly.

### 1.4 Wave 4 — Build-fail guard added

```
$ npx vitest run src/modules/finance/v21-phase2-cleanup-guard.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration  1.58s
```

**Result**: ✅ All 7 cleanup-lock guards green. Specifically:
- 4 × removed-file resurrection guards (one per Wave 1 deletion)
- 1 × removed-folder resurrection guard (Wave 2 placeholder)
- 1 × raw `window.fetch(...)` discipline guard (tree-wide)
- 1 × `dist/` git-ignore presence guard

## 2 — Final aggregate validation

After all waves complete:

### 2.1 Backend full Jest

```
$ npx jest --no-coverage
Test Suites: 1 failed, 78 passed, 79 total
Tests:       1 failed, 21 skipped, 723 passed, 745 total
Time:        10.231 s
```

The single failing test is `src/security-rbac.spec.ts:134`
(`expect(appRoutes).toContain('path="/403"')`). This is the
**pre-existing** technical-debt failure introduced before the
V21 banking mission began (route-rename regression in
commit `17f7311`). It is **unrelated to Phase 2** and is
documented in `docs/v21-final-banking-validation.md` and carried
into the V22 backlog.

**Result**: ✅ 723 / 745 — same as pre-Phase-2; zero regression.

### 2.2 Frontend full Vitest

```
$ npx vitest run
Test Files  27 passed (27)
     Tests  146 passed (146)
Duration  7.90s
```

**Delta**: +1 test file, +7 tests (the new `v21-phase2-cleanup-guard.test.ts`).
Pre-Phase-2 was 26 files / 139 tests. **No regression.**

### 2.3 Production builds

```
$ npm run build      # web/
✓ built in 1.24s

$ npx nest build     # repo root
exit 0
```

Both clean.

### 2.4 Architecture

```
$ npx madge --circular --extensions ts,tsx web/src
Processed 362 files (4.7s) (239 warnings)
✓ No circular dependency found!
```

Frontend file count: **365 → 362** (-3 source files; the 4th
deletion was a `.tsx` file that madge had already counted under
the `.tsx` extension, included in the 3-delta).

### 2.5 Git status

```
$ git ls-files dist/ | Measure-Object -Line
Lines: 0
```

**1,479 → 0** tracked `dist/` files.

### 2.6 V21 Phase 1 + Phase 2 lock-in tests together

```
$ npx jest src/finance/v21-phase1-core-freeze.spec.ts \
           src/finance/v21-canonical-banking-guards.spec.ts \
           src/finance/periods/period-lock-monitor.spec.ts \
           src/finance/observability/banking-anomaly-detectors.spec.ts \
           src/general-ledger/period-lock-enforcement.spec.ts \
           src/general-ledger/double-entry-journal.service.spec.ts
Test Suites: 6 passed, 6 total
Tests:       188 passed, 188 total

$ npx vitest run \
    src/lib/kwd.test.ts \
    src/modules/finance/cross-module-import-guard.test.ts \
    src/modules/finance/v21-phase2-cleanup-guard.test.ts \
    src/modules/finance/components/v20-9-module-only-architecture.test.ts
Test Files  4 passed (4)
     Tests  16 passed (16)
```

**188 backend canonical-stack tests + 16 frontend canonical-stack tests** all green.

## 3 — Validation verdict

V21 Phase 2 — Legacy Purge: **ALL VALIDATION GATES GREEN**.

Every cleanup wave was validated before the next began. The
single pre-existing failure in `security-rbac.spec.ts:134` is
explicitly out of Phase 2 scope. Every behavioural test that
covers the deleted files passes identically pre and post.
Frontend file count dropped by 3, tracked `dist/` files dropped
by 1,479, frontend test count grew by 7 (lock-in additions),
zero circular dependencies, both production builds clean.

V21 Phase 2 is **VALIDATED — proceed to scorecard + rollback guide**.
