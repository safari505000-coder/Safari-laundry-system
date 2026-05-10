# V21 — PHASE 2 — ROLLBACK GUIDE

> Per-wave rollback procedure for V21 Phase 2. Every wave is
> independently revertible; the waves have no chain dependencies
> between them. Each procedure includes the verification command
> to run after the rollback to confirm the previous behaviour
> is restored.

## 1 — Full rollback (revert all 4 waves at once)

```powershell
# From repo root, with no uncommitted work in flight:
git revert --no-edit <wave-4-commit-sha> <wave-3-commit-sha> <wave-2-commit-sha> <wave-1-commit-sha>
git push
# Wait for CI to validate. Expected post-revert state:
#   - 5 source files restored (4 .ts/.tsx + 1 README)
#   - web/src/modules/callcenter/ folder restored
#   - dist/ re-tracked in git (1,479 files)
#   - v21-phase2-cleanup-guard.test.ts removed
#   - Frontend tests: 139 / 139 (was 146; -7 lock-in)
#   - Backend tests: 723 / 745 (unchanged)
```

## 2 — Per-wave granular rollback

### 2.1 Rolling back Wave 1 only (restore 4 frontend orphan files)

```powershell
# Restore each file from the parent commit (or the wave-1 commit):
git checkout <wave-1-parent-sha> -- web/src/modules/call-center/collections-report/utils/grouping.ts
git checkout <wave-1-parent-sha> -- web/src/modules/shared/components/onboarding/OnboardingTour.tsx
git checkout <wave-1-parent-sha> -- web/src/modules/shared/hooks/use-responsive-mode.ts
git checkout <wave-1-parent-sha> -- web/src/modules/shared/routing/lazy-route.tsx

# Then either remove the resurrection-guard tests OR leave them in
# place (they will fail until you also remove the corresponding
# entries from REMOVED_FILES in v21-phase2-cleanup-guard.test.ts).

# Verification:
cd web; npx vitest run; cd ..
# Expected: tests pass; +4 source files in tree.
```

### 2.2 Rolling back Wave 2 only (restore placeholder folder)

```powershell
mkdir -Force web/src/modules/callcenter
git checkout <wave-2-parent-sha> -- web/src/modules/callcenter/README.md

# Then remove the matching entry from REMOVED_FOLDERS in
# v21-phase2-cleanup-guard.test.ts, OR delete the file again.

# Verification:
cd web; npx vitest run src/modules/finance/v21-phase2-cleanup-guard.test.ts; cd ..
```

### 2.3 Rolling back Wave 3 only (re-track `dist/`)

```powershell
# Remove the dist/ block from .gitignore:
# Edit .gitignore manually OR:
git revert <wave-3-commit-sha>

# Re-add dist/ to git index:
git add dist/

# Verification:
$count = (git ls-files dist/ | Measure-Object -Line).Lines
Write-Output "Tracked dist files after rollback: $count"
# Expected: ~1,479

# Verification of build:
npx nest build
# Expected: exit 0; dist/ is identical (just re-tracked).
```

**Caution**: rolling back Wave 3 reintroduces the PR-diff
pollution (every `nest build` will re-modify hundreds of `dist/*.js`
files in `git status`). Only do this if you have a specific
operational reason (e.g. a deploy pipeline that depends on
`dist/` being committed).

### 2.4 Rolling back Wave 4 only (remove the build-fail guard)

```powershell
# Delete the guard file:
Remove-Item web/src/modules/finance/v21-phase2-cleanup-guard.test.ts

# Verification:
cd web; npx vitest run; cd ..
# Expected: 139 tests (down from 146).
```

**Caution**: rolling back Wave 4 alone removes the lock-in for
Waves 1-3. A future PR could then resurrect the deleted files /
folders / `dist/` tracking without CI complaining.

## 3 — Rollback safety guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **No historical financial row mutated** | Phase 2 made zero database changes; revert restores file state only |
| **No schema migration generated** | No Prisma down-migration needed |
| **No API contract changed** | No DTOs / controllers added or removed; revert is a no-op for clients |
| **Settlement outputs identical** | `customer-ledger.service.ts` was not modified in Phase 2 |
| **Production builds remain green** | The reverted change set is purely additive-or-deletion of unused files |
| **Phase 1 lock-ins remain intact** | Phase 1 specs do not depend on any Phase 2 deletion |

## 4 — Restoration verification matrix

After ANY rollback (full or partial), run these commands and
confirm the expected results:

| Command | Expected after full rollback |
|---------|------------------------------|
| `(git ls-files dist/ \| Measure-Object -Line).Lines` | 1479 |
| `Test-Path web/src/modules/callcenter` | True |
| `Test-Path web/src/modules/call-center/collections-report/utils/grouping.ts` | True |
| `Test-Path web/src/modules/shared/components/onboarding/OnboardingTour.tsx` | True |
| `Test-Path web/src/modules/shared/hooks/use-responsive-mode.ts` | True |
| `Test-Path web/src/modules/shared/routing/lazy-route.tsx` | True |
| `Test-Path web/src/modules/finance/v21-phase2-cleanup-guard.test.ts` | False |
| `cd web; npx vitest run; cd ..` | 139 / 139 ✅ |
| `cd web; npm run build; cd ..` | clean |
| `npx nest build` | exit 0 |
| `npx jest --no-coverage` | 723 / 745 (1 pre-existing failure unchanged) |

If any row above does NOT match expectations, the rollback was
partial; rerun the specific wave's procedure.

## 5 — Forward-roll (re-applying Phase 2 after rollback)

If the rollback was diagnostic and you decide to re-apply Phase 2:

```powershell
git revert --no-edit <rollback-commit-sha>
# OR re-execute the original waves using the implementation report
# as a runbook (docs/v21-phase2-implementation.md).
```
