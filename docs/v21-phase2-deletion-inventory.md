# V21 — PHASE 2 — DELETION INVENTORY

> Per-file record of every artefact removed during V21 Phase 2.
> Each row carries the original size, the verification trace, and
> the exact restoration command. This file is the single
> authoritative inventory; cross-reference with
> `v21-phase2-implementation.md` for the wave grouping and
> `v21-phase2-rollback-guide.md` for the multi-wave revert
> procedure.

## 1 — Source files (Wave 1)

### 1.1 `web/src/modules/call-center/collections-report/utils/grouping.ts`

| Field | Value |
|-------|-------|
| SHA before deletion | (`git log` of HEAD~1 will show last-committed sha) |
| Bytes | 5,279 |
| Lines | 148 |
| Exports | `groupOutstandingByDriver`, `groupUnpaidByBranch`, `filterUnpaidLinks`, `DriverAggregate`, `BranchAggregate` |
| Importer scan | `Grep "groupOutstandingByDriver\|groupUnpaidByBranch\|filterUnpaidLinks\|from.*grouping"` → only the file itself |
| Madge orphan trace | reported by `madge --orphans --ts-config tsconfig.app.json src` |
| Validation gate | `npx vitest run` → 139 / 139 ✅ |
| Restore command | `git checkout HEAD~N -- web/src/modules/call-center/collections-report/utils/grouping.ts` (where `N` is the wave-distance) |

### 1.2 `web/src/modules/shared/components/onboarding/OnboardingTour.tsx`

| Field | Value |
|-------|-------|
| Bytes | 4,599 |
| Lines | ~100 |
| Exports | `OnboardingTour`, `OnboardingStep`, `OnboardingTourProps` |
| Importer scan | `Grep "OnboardingTour"` → only the file itself |
| Madge orphan trace | yes |
| Validation gate | `npx vitest run` → 139 / 139 ✅ |
| Restore command | `git checkout HEAD~N -- web/src/modules/shared/components/onboarding/OnboardingTour.tsx` |

### 1.3 `web/src/modules/shared/hooks/use-responsive-mode.ts`

| Field | Value |
|-------|-------|
| Bytes | 2,069 |
| Lines | 57 |
| Exports | `useResponsiveMode`, `usePrefersReducedMotion`, `ResponsiveMode` |
| Importer scan | `Grep "useResponsiveMode\|usePrefersReducedMotion"` → only the file itself |
| Madge orphan trace | yes |
| Validation gate | `npx vitest run` → 139 / 139 ✅ |
| Restore command | `git checkout HEAD~N -- web/src/modules/shared/hooks/use-responsive-mode.ts` |

### 1.4 `web/src/modules/shared/routing/lazy-route.tsx`

| Field | Value |
|-------|-------|
| Bytes | 1,752 |
| Lines | 56 |
| Exports | `lazyRoute`, `LazyRouteOptions` |
| Importer scan | `Grep "lazyRoute\|lazy-route"` → only the file itself |
| Madge orphan trace | yes |
| Validation gate | `npx vitest run` → 139 / 139 ✅ |
| Restore command | `git checkout HEAD~N -- web/src/modules/shared/routing/lazy-route.tsx` |

## 2 — Placeholder folder (Wave 2)

### 2.1 `web/src/modules/callcenter/`

| Field | Value |
|-------|-------|
| Files | 1 (`README.md`, 1,451 bytes) |
| Type | Aborted V20.7 single-word rename target |
| Importer scan | `Grep "modules/callcenter"` → only `v20-8-ui-consistency-expanded.test.ts` (gracefully skips missing folders via `safeStat`) |
| Validation gate | `npx vitest run` (3 guard files) → 5 / 5 ✅ |
| Restore command | `git checkout HEAD~N -- web/src/modules/callcenter/` (recreates folder + README) |

## 3 — Tracked build artefacts (Wave 3)

### 3.1 `dist/` git untracking

| Field | Value |
|-------|-------|
| Files removed from git index | **1,479** |
| Files preserved in working tree | **1,731** (rebuilt by `nest build`) |
| `.gitignore` entries added | `dist/` and `web/dist/` |
| Verification before | `(git ls-files dist/ \| Measure-Object -Line).Lines` → 1479 |
| Verification after | `(git ls-files dist/ \| Measure-Object -Line).Lines` → 0 |
| Validation gate | `npx nest build` → exit 0; `dist/` regenerated locally |
| Restore command | `git revert <wave-3-commit-sha>` re-tracks every file (no rebuild needed). |

## 4 — Files added (additive lock-in)

The Phase 2 mission adds one file to lock in the cleanup. It is
listed here as a record but is **not a deletion**:

| File | Purpose | Tests |
|------|---------|------:|
| `web/src/modules/finance/v21-phase2-cleanup-guard.test.ts` | Build-fail guards: 4 file-resurrection, 1 folder-resurrection, 1 raw-fetch ban, 1 `dist/` git-ignore presence | **7 / 7 ✅** |

## 5 — Aggregate

| Metric | Value |
|--------|------:|
| Source files deleted | **5** (4 .ts/.tsx + 1 README) |
| Source bytes deleted | **15,150** |
| Source lines deleted (rounded) | **~370** |
| Folders deleted | **1** (`web/src/modules/callcenter/`) |
| Git-index entries deleted (`dist/`) | **1,479** |
| Build-fail guards added | **7** (in 1 new spec file) |
| Total `web/src/` source-file count delta | -3 (some deletions were previously counted as orphans by madge but inside test paths; net delta is 365 → 362 per madge re-run) |
