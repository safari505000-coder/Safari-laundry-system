# V21 — PHASE 2 — LEGACY DISCOVERY AUDIT

> Forensic, read-only inventory pass over the entire repository
> performed against the post-V21-Phase-1 (Core Freeze) baseline.
> Every finding is classified as **CRITICAL_KEEP**,
> **NEEDS_MIGRATION**, **SAFE_REMOVE**, or **LEGACY_QUARANTINED**.
>
> The actual deletions execute in `docs/v21-phase2-implementation.md`
> and `docs/v21-phase2-deletion-inventory.md`. This file is the
> evidence base for them.

## 0 — Methodology

| # | Sweep | Tool | Scope |
|---|-------|------|-------|
| 1 | Frontend orphan files (zero importers) | `madge --orphans --ts-config tsconfig.app.json` | `web/src/` |
| 2 | Backend orphan files (zero importers) | `madge --orphans --ts-config tsconfig.json` | `src/` |
| 3 | Tracked build artefacts | `git ls-files dist/` | repo root |
| 4 | Empty / placeholder folders | `Glob` | `web/src/modules/`, `src/` |
| 5 | Duplicate components / hooks (V20.7-V20.9 era) | `Grep` for sibling components with overlapping names | `web/src/` |
| 6 | Cross-module leakage (illegal deep imports) | `Grep` `from '@/modules/<other>/(state|api|hooks)/'` | `web/src/modules/` |
| 7 | Direct fetch / undisciplined API calls | `Grep` for `fetch(` / `axios.` outside `lib/api.ts` | `web/src/` |
| 8 | Circular dependencies | `madge --circular` | `web/src/`, `src/` |

Every result is reproducible against the same commit.

---

## 1 — Executive verdict

| Category | Count | Worst severity |
|----------|------:|----------------|
| **SAFE_REMOVE** — frontend orphan source files | **4** | LOW (zero importers, zero behavioural risk) |
| **SAFE_REMOVE** — placeholder folder | **1** (`web/src/modules/callcenter/`) | LOW (README-only) |
| **SAFE_REMOVE** — tracked build artefacts | **1,479 files** in `dist/` | MEDIUM (PR diff pollution) |
| **CRITICAL_KEEP** — dynamically loaded workers | 1 (`bcrypt.worker.ts`) | n/a (CRITICAL — runtime depends on it) |
| **CRITICAL_KEEP** — designed deployment-stub adapters | 3 (Kafka / RabbitMQ / Redis Streams) | n/a (designed extension points) |
| **CRITICAL_KEEP** — V21 aspirational canonical re-export barrels | 4 (canonical-money/-subscription/-invoice-status/-customer-financials) | n/a (Phase 3 contract surface; consumer migration is V22) |
| **CRITICAL_KEEP** — quarantined legacy reader | 1 (`legacy/legacy-debt-readers.ts`) | LOW (V22 candidate per `v21-gl-retirement-report.md`) |
| **NEEDS_MIGRATION** — frontend pages with display-only money math | 3 (payroll-page, monthly-summary-page, commission-rules-page) | LOW (V22 candidates) |
| **LEGACY_QUARANTINED** — legacy GL mirror | 1 (`general-ledger.service.ts` mirror reads in FinancialTimeline) | MEDIUM (V22 retirement plan in `v21-gl-retirement-report.md`) |
| Circular dependencies | **0** frontend, 8 backend (`forwardRef`-resolved settlement triangle, documented in V21 Phase 4) | LOW |
| Duplicate UI primitives | **0** (V20.7-V20.8 design-system consolidation closed all duplicates) | n/a |
| Cross-module deep imports | **0** outside `modules/finance/` (Phase 1 cross-module guard locks this) | n/a |
| Direct `fetch(`/`axios.` calls outside `lib/api.ts` | **0** (V20.8 single-fetch-channel guarantee) | n/a |

**Headline finding:** the source tree is at a **clean baseline**.
The only material cleanups are 4 frontend orphan files, 1
placeholder folder, and the `dist/` git-tracking pollution.
Everything else is either critical infrastructure, a designed
extension point, or already documented for V22 migration.

---

## 2 — Per-finding classification

### 2.1 SAFE_REMOVE — frontend orphan source files

Each file below has **zero importers** (verified by
`madge --orphans --ts-config tsconfig.app.json`) and was confirmed
orphan by direct `Grep` for the export name. All 4 are dated
V20.7-V20.9 infrastructure that was built proactively but never
adopted by a consumer.

#### 2.1.1 `web/src/modules/call-center/collections-report/utils/grouping.ts`

| Field | Value |
|-------|-------|
| Lines | 148 |
| Exports | `groupOutstandingByDriver`, `groupUnpaidByBranch`, `filterUnpaidLinks`, `DriverAggregate`, `BranchAggregate` |
| Importers | **0** |
| Era | V20.7 (collections-report module) |
| Why orphan | Built as the grouping helper for `collections-report-page.tsx`; the page chose a different rendering approach and never adopted these helpers |
| Removal safety | ✅ Zero behaviour change; `collections-report-page.tsx` does not reference any export |
| Rollback safety | ✅ Single git revert restores file |

#### 2.1.2 `web/src/modules/shared/components/onboarding/OnboardingTour.tsx`

| Field | Value |
|-------|-------|
| Lines | ~100 |
| Exports | `OnboardingTour`, `OnboardingStep`, `OnboardingTourProps` |
| Importers | **0** |
| Era | V20.9 Phase 4 (contextual onboarding) |
| Why orphan | Designed as a per-page guided tour; consumer pages never wired it in; the V20.9 Phase 4 final report does not list any active tour |
| Removal safety | ✅ Zero behaviour change |
| Rollback safety | ✅ Single git revert |

#### 2.1.3 `web/src/modules/shared/hooks/use-responsive-mode.ts`

| Field | Value |
|-------|-------|
| Lines | 57 |
| Exports | `useResponsiveMode`, `usePrefersReducedMotion`, `ResponsiveMode` |
| Importers | **0** |
| Era | V20.9 Phase 4 (responsive-mode hook) |
| Why orphan | Built for the Collections workspace's planned three-pane → two-pane → single-column layout; the workspace shipped with Tailwind responsive classes instead, never imported the hook |
| Removal safety | ✅ Zero behaviour change |
| Rollback safety | ✅ Single git revert |

#### 2.1.4 `web/src/modules/shared/routing/lazy-route.tsx`

| Field | Value |
|-------|-------|
| Lines | 56 |
| Exports | `lazyRoute`, `LazyRouteOptions` |
| Importers | **0** |
| Era | V20.7 Phase 6 (code-splitting helper) |
| Why orphan | Designed as the canonical `React.lazy()` wrapper; App.tsx instead does direct `import` of every page (no code-splitting adopted) |
| Removal safety | ✅ Zero behaviour change |
| Rollback safety | ✅ Single git revert |

### 2.2 SAFE_REMOVE — placeholder folder

#### 2.2.1 `web/src/modules/callcenter/`

| Field | Value |
|-------|-------|
| Files | 1 (README.md only) |
| Era | V20.7 Phase 2 (aborted single-word rename) |
| Why orphan | The real Call Center module is `web/src/modules/call-center/` (kebab-case). This single-word folder was created as the destination for a planned rename that was never executed. The README acknowledges the parallel folder. |
| Removal safety | ✅ Zero importers (only one file referencing the path is the V20.8 expanded UI consistency guard, which uses `safeStat` and gracefully skips missing folders) |
| Rollback safety | ✅ Single git revert |

### 2.3 SAFE_REMOVE — tracked build artefact

#### 2.3.1 `dist/`

| Field | Value |
|-------|-------|
| Tracked files | **1,479** |
| Working tree files | ~1,731 |
| `.gitignore` entry | **Missing** |
| Verification | `(git ls-files dist/ \| Measure-Object -Line).Lines` returns 1479 |
| Why a problem | Every `nest build` dirties hundreds of `dist/*.js` and `dist/*.d.ts` files; PR diffs include unrelated build churn that hides the real diff; production builds should regenerate `dist/` from `src/`, never read it from git |
| Recommended action | Add `dist/` to `.gitignore`; `git rm -r --cached dist/`; commit |
| Removal safety | ✅ Zero behaviour change (every consumer of `dist/` rebuilds from `src/`); the operator's local `dist/` keeps its files (only the git index is updated) |
| Rollback safety | ✅ Revert the commit and `dist/` is re-added to the index |

### 2.4 CRITICAL_KEEP — dynamically loaded workers

#### 2.4.1 `src/auth/bcrypt.worker.ts`

| Field | Value |
|-------|-------|
| Why orphan-looking | Loaded via `new Worker(path.join(__dirname, 'bcrypt.worker.js'))` in `bcrypt.service.ts:39`; static import-graph tools cannot see the dynamic load |
| Recommended action | **DO NOT REMOVE** — runtime depends on this file |
| Documented since | V19 (long before V21) |

### 2.5 CRITICAL_KEEP — designed deployment-stub adapters

#### 2.5.1 `src/domain-events/adapters/{kafka,rabbitmq,redis-streams}-event-bus.adapter.ts`

| Field | Value |
|-------|-------|
| Era | V20.9 Phase 1 (production-ready stubs for distributed event-bus deployment) |
| Why orphan-looking | Deliberately not registered in `AppModule`; operators wire them in via DI when scaling beyond a single node |
| Recommended action | **DO NOT REMOVE** — these are the documented extension points for horizontal scale-out |
| Documented since | V20.9 Phase 1 final report |

### 2.6 CRITICAL_KEEP — V21 aspirational canonical re-export barrels

#### 2.6.1 `src/finance/canonical-{money,subscription,invoice-status,customer-financials}.ts`

| Field | Value |
|-------|-------|
| Lines (each) | 20-40 |
| Era | V21 Phase 3 (Banking Core Hardening) |
| Why orphan-looking | Aspirational re-export barrels for the future canonical money / subscription / invoice / customer-financials boundary; consumer migration is queued for V22 |
| Why kept | Removing them would erase the architectural contract the Phase 3 banking-grade hardening doc is built on; they are a **designed migration path**, not dead code |
| Documented since | `docs/v21-canonical-banking-discovery-report.md` and `docs/v21-phase-3-banking-core-hardening-report.md` |

### 2.7 LEGACY_QUARANTINED

#### 2.7.1 `src/legacy/legacy-debt-readers.ts`

| Field | Value |
|-------|-------|
| Era | V20.6 Phase 2 (quarantined legacy debt reader) |
| Why kept | Adapter for legacy debt-visibility surfaces still in use by the customer directory page; V22 retirement plan documented |
| Documented since | `docs/v21-gl-retirement-report.md` |

#### 2.7.2 Legacy GL mirror parallel reads

`FinancialTimeline.generalLedgerEntry.findMany` reads from the
legacy GL mirror table alongside canonical `JournalEntry`.
Documented in `docs/v21-phase1-ssot-verification.md` and
retirement plan in `docs/v21-gl-retirement-report.md`.

### 2.8 NEEDS_MIGRATION — V22 candidates

These are documented in `docs/v21-phase1-scorecard.md §5` and not
acted on in this phase:

1. `web/src/pages/payroll-page.tsx` — net-pay shadow calc (lines 50-63). V22: extend `payroll.response.ts` to expose `netSalaryKd`; rewire frontend.
2. `web/src/pages/monthly-summary-page.tsx` — `totalApprovedKd` reduce (line 608). V22: backend exposes pre-aggregated total.
3. `web/src/pages/commission-rules-page.tsx` — `parseFloat(x).toFixed(3)` formatter (lines 199, 287). V22: substitute `formatKwdAmount`.

---

## 3 — Negative findings (the audit's silence is loud)

The following sweeps returned **zero** findings — confirming
prior cleanup missions did their job:

| Sweep | V21 Phase 2 finding |
|-------|---------------------|
| Duplicate UI primitives (badges, KPI cards, tables, loaders, skeletons, empty states, timeline cards, status chips, headers, financial widgets) | **0** — V20.7-V20.8 design-system consolidation closed every duplicate |
| Direct `fetch(` / `axios.` calls outside `lib/api.ts` and `modules/<m>/api/*` | **0** — V20.8 single-fetch-channel guarantee holds |
| Cross-module deep imports (other modules → `@/modules/finance/{state,api,hooks}/*`) | **0** — V21 Phase 1 cross-module guard verified |
| Frontend money math leaks in guarded files | **0** — V21 Phase 1 lock-in holds (14 files now in `moneyComparisonGuardedFiles`) |
| Direct journal/wallet/debt-ledger writes outside canonical writers | **0** — V21 Phase 1 anti-bypass suite verified |
| Frontend circular dependencies | **0** — `madge --circular web/src` is silent |
| Backend circular dependencies (production code) | 8 (`forwardRef`-resolved settlement triangle) | LOW — documented intentional design |

---

## 4 — Phase 2 deletion plan summary

| Wave | Action | Files affected | Validation gate |
|------|--------|---------------:|-----------------|
| 1 | Delete 4 frontend orphan source files | 4 | `npx vitest run`, `npm run build` |
| 2 | Delete `web/src/modules/callcenter/` placeholder folder | 1 | `npx vitest run`, `npm run build` |
| 3 | Add `dist/` to `.gitignore` + `git rm -r --cached dist/` | 1,479 (git index only) | `npx jest --no-coverage`, `npx nest build` |
| 4 | Add NEW build-fail guards for the new boundary | +0 deletions; +1 new spec | `npx jest --no-coverage` |

After every wave the validation gate must be **green**.

See `docs/v21-phase2-implementation.md` for the executed wave log,
`docs/v21-phase2-deletion-inventory.md` for the line-by-line
inventory, `docs/v21-phase2-validation.md` for the post-wave test
results, `docs/v21-phase2-rollback-guide.md` for the per-file
rollback procedure, and `docs/v21-phase2-architecture-scorecard.md`
for the final scorecard.
