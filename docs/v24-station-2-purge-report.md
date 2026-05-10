# V24 Station 2 — Purge Report (Pre-Deletion Audit)

> **Status: DISCOVERY COMPLETE — awaiting user approval before The Great Purge.**
>
> **Mission**: transition Safari ERP from "Stable Operation" to "Canonical Banking Core Layer" by deleting every byte of bloat (dead files, dead exports, unused libraries, legacy helpers superseded by V24) without disturbing the Green Matrix (89 / 89 suites, 798 / 798 PASS — established at the close of V24 Wave B).
>
> **Methodology**: ran `depcheck` and `knip` on both the backend (`src/`) and frontend (`web/src/`) projects, plus targeted manual scans (`@deprecated` markers, V-version-prefixed legacy files, empty module skeletons, orphan specs, tracked-but-gitignored files, banking-core inventory). All findings below are pre-deletion — nothing has been removed yet.

---

## 1. Banking Core Inventory (verified intact and isolated)

The four sacred layers the V24 doctrine forbids touching outside an architectural review:

| Layer | Path | Files |
|---|---|---|
| **Ledger / Journal** | `src/general-ledger/` | 13 (`double-entry-journal.service.ts`, `journal-source.service.ts`, `general-ledger.service.ts`, `journal-drift.cron.ts`, `period-lock-enforcement.spec.ts`, etc.) |
| **Aggregators** | `src/finance/canonical-customer-debt.util.ts` + `src/finance/invoice-payment-status.service.ts` + `src/finance/utils/` + `src/finance/debt-customer-aggregates.util.ts` | 5 |
| **Snapshots** | `src/finance/snapshots/` | 8 (`financial-snapshot.service.ts`, `snapshot-realtime-refresher.service.ts`, etc.) |
| **Reconciliation** | `src/finance/reconciliation/` | 4 (`reconciliation.service.ts`, `reconciliation.controller.ts`, `v24-reconciliation-baseline.spec.ts`) |

**Conclusion**: zero cross-contamination from non-core layers; every file belongs to its layer's stated purpose. Core Isolation requirement is already satisfied — Station 2 will keep these layers untouched and only purge from outside the perimeter.

---

## 2. Findings ranked by Tier

### TIER 1 — HIGH CONFIDENCE / SAFE TO DELETE (zero behaviour change, zero test impact)

#### 1.1 — Tracked `dist/` build artefacts (1,479 files, **5.7 MB**)

| Issue | Detail |
|---|---|
| Status | Already gitignored at `.gitignore:20` (`dist/`) since V21 Phase 2 — but the files were committed BEFORE that rule and remain tracked. |
| Impact | Every `nest build` run rewrites the tracked copies → noisy `git status` (the conversation-start git-status snapshot listed every `dist/*.js` and `dist/*.d.ts` as `M`); every PR diff is polluted with thousands of unrelated lines. |
| Action | `git rm -r --cached dist/` (file system unaffected; only the index entries are removed). One commit, immediate signal-to-noise restoration on all future PRs. |
| Risk | **None** — production deploys rebuild from `src/` (see `npm run dist:start` script); the repo never reads `dist/`. |
| Verification | After untracking, `npx jest --runInBand` and `cd web && npx vitest run` MUST stay 798/798 + 259/259 (no source files moved). |

#### 1.2 — Tracked uploads/ runtime data (2 files)

| Issue | Detail |
|---|---|
| Status | Already gitignored at `.gitignore:8` (`uploads/`); 2 files stayed tracked as historical commits. |
| Action | `git rm -r --cached uploads/` if the 2 files are not legitimately needed. **Decision deferred to user** — these may be seed/demo assets. |
| Risk | Low — but verify file purpose first. |

#### 1.3 — Empty FE module skeleton directories (6 dirs, 6 README.md only)

V20.6 Phase 6A scaffolded these "future modules" with a single README each. Six years later, none has any source file. Each README documents intent but the module never materialised — every actual screen lives elsewhere (e.g. accounting UI is in `web/src/pages/` and `modules/finance/` not `modules/accounting/`).

| Path | Contents |
|---|---|
| `web/src/modules/accounting/` | only `README.md` (1005 B) |
| `web/src/modules/customer360/` | only `README.md` (873 B) |
| `web/src/modules/dashboards/` | only `README.md` (738 B) |
| `web/src/modules/fraud/` | only `README.md` (464 B) |
| `web/src/modules/risk/` | only `README.md` (479 B) |
| `web/src/modules/subscribers/` | only `README.md` (1349 B) |

| Action | Detail |
|---|---|
| Recommendation | Delete all 6 directories outright. |
| Risk | **Zero** — no .ts/.tsx files; nothing imports from these paths. Validated by recursive enumeration. |
| Test impact | None — vitest doesn't pick up `*.md` test files. |

#### 1.4 — Truly unused FRONTEND dependencies (11 packages)

Cross-validated with `depcheck` AND `knip` AND `Get-ChildItem | Select-String` (zero source-code references):

| Package | Why unused | Replacement in repo |
|---|---|---|
| `@radix-ui/react-dialog` | 0 imports anywhere | `@base-ui/react` (Radix's modern successor; already in deps) |
| `@radix-ui/react-dropdown-menu` | 0 imports | same |
| `@radix-ui/react-label` | 0 imports | same |
| `@radix-ui/react-scroll-area` | 0 imports | same |
| `@radix-ui/react-separator` | 0 imports | same |
| `@radix-ui/react-slot` | 0 imports | same |
| `@radix-ui/react-tabs` | 0 imports | same |
| `@radix-ui/react-tooltip` | 0 imports | same |
| `next-themes` | 0 imports | hand-rolled in `web/src/modules/shared/theme/theme-provider.tsx` |
| `react-leaflet` | 0 imports | `leaflet` directly (no React wrapper used) |
| `@testing-library/user-event` (dev) | 0 imports in tests | not currently exercised by the vitest suite |

| Action | `cd web && npm uninstall <package>` for all 11. |
|---|---|
| Risk | **Zero** — no source-code refs (verified). `package-lock.json` will rewrite cleanly. |
| Test impact | 259/259 vitest must still PASS afterward. |
| Estimated install-size saving | ~30–40 MB of `node_modules` (Radix's transitive React deps + leaflet plugins). |

#### 1.5 — Truly unused BACKEND dependencies (5 packages)

Cross-validated by `depcheck` AND `knip` AND content grep:

| Package | Status | Notes |
|---|---|---|
| `@google-cloud/storage` | 0 imports anywhere | Most likely a leftover from a planned-but-never-shipped GCS upload integration. |
| `@eslint/eslintrc` (dev) | 0 imports in `eslint.config.mjs` | ESLint v9 flat config doesn't need the legacy compat shim. |
| `source-map-support` (dev) | 0 imports anywhere (src/, scripts/, test/) | Not referenced at runtime; Nest stack traces work via `--enable-source-maps` Node flag if needed. |
| `ts-loader` (dev) | 0 imports anywhere | Webpack loader; this project compiles via `tsc` (Nest CLI), not Webpack. |
| `tsconfig-paths` (dev) | 0 imports in src/, scripts/, or test/ | Jest config in `package.json` uses `ts-jest` directly; no path-alias resolution needed at test time. |
| `@types/supertest` (dev) | knip-flagged | E2E specs do not use supertest currently (the only `*.e2e-spec.ts` files are placeholders). |
| `supertest` (dev) | knip-flagged | Same. **Decision: keep until e2e is revived OR drop both together.** |

| Action | `npm uninstall <package>` for the 5 verified-unused (`@google-cloud/storage`, `@eslint/eslintrc`, `source-map-support`, `ts-loader`, `tsconfig-paths`). |
|---|---|
| Risk | **Zero** for the 5. **Low** for `supertest` + `@types/supertest` — confirm with user whether e2e tests are intended for revival. |
| Test impact | 798/798 jest must still PASS afterward (no spec file uses these packages). |
| Estimated install-size saving | ~15–25 MB (`@google-cloud/storage` is the largest single contributor). |

---

### TIER 2 — REVIEW REQUIRED (verified dead, but proximate to Banking Core)

#### 2.1 — 53 dead exports across 41 backend files

Knip confirmed these symbols are exported but never imported anywhere in `src/` / `test/` / `scripts/`. Many are tunable constants that became internal-only after refactors. Grouped by location relative to the Banking Core:

##### 2.1.a — Inside Banking Core (require explicit user blessing per Frozen Core Policy)

| File | Unused export(s) | Verdict |
|---|---|---|
| `src/general-ledger/double-entry-journal.service.ts` | `CRITICAL_FAILURE_WINDOW_MS` | Likely an old SLA threshold; safe to remove if no operator runbook references it. |
| `src/finance/snapshots/snapshot-realtime-refresher.service.ts` | `DEFAULT_DEBOUNCE_MS`, `DEFAULT_MIN_INTERVAL_MS`, `DEFAULT_MAX_CONCURRENCY` | Tuning constants exported but never imported externally; safe to inline as `const` inside the module. |
| `src/finance/invoice-payment-status.service.ts` | `INVOICE_REMAINING_TOLERANCE_KD` | Tolerance epsilon — should stay `export` so the V24 reconciliation suite can assert on it later. **Recommend: KEEP** (anticipated future use). |
| `src/finance/utils/accountant-dashboard-math.ts` | `RECONCILIATION_BALANCE_EPS` | Same reasoning — keep for future spec assertions. |
| `src/finance/periods/financial-periods.service.ts` | `ForbiddenException` | Re-exported Nest exception that nothing consumes externally. Safe to drop the re-export. |
| `src/finance/finance-money.ts` | `HANDOVER_TOLERANCE_MINOR`, `declaredNumberToMinor` | Legacy handover-cash helpers; investigate for actual reachability before removing. |
| `src/finance/debt-ledger-payment-origin.util.ts` | `ALLOWED_PAYMENT_SOURCE_REF_PREFIXES` | Validation allow-list constant; if no caller validates against it, remove. |

##### 2.1.b — Outside Banking Core (lower-risk cleanup)

| File | Unused export(s) | Notes |
|---|---|---|
| `src/cash-monitor/cash-rules.ts` | `GRACE_HOURS`, `MIN_CRITICAL_AMOUNT_KD`, `SHIFT_CAP_HOURS` | Likely superseded by V24 `cash-classifier.service.ts` constants. |
| `src/cash-monitor/driver-amount-map.ts` | `sumClassifiedKd`, `getDriverAmountFromSSoT` | Two helpers that became internal-only. |
| `src/cash-monitor/cash-write-police.guard.ts` | `CASH_WRITE_ENDPOINT_KEY` | Decorator metadata key; verify no `Reflector.get(CASH_WRITE_ENDPOINT_KEY)` consumer. |
| `src/expenses/expenses.service.ts` | `deriveOwnerType`, `DRIVER_ONLY_CATEGORIES` | `deriveOwnerType` is referenced internally — knip false positive likely (it's also imported as a type). **Verify before removing.** |
| `src/collections-workflow/collections-workflow.service.ts` | `MAX_LIVE_ITEMS` | Page-size cap. |
| `src/collections-workflow/dto/collections-workflow.dto.ts` | `WORKFLOW_KINDS`, `WORKFLOW_STATUSES`, `WORKFLOW_PRIORITIES` | Enum-like arrays; verify no validator references them. |
| `src/customer-notifications/customer-notifications.service.ts` | `formatStandaloneReceiptLabelFromHistoryId` | Standalone receipt formatter; check WhatsApp templates. |
| `src/customer-notifications/whatsapp.queue.ts` | `WHATSAPP_BACKOFF_MS` | BullMQ backoff constant. |
| `src/orders/orders.service.ts` | `STALE_QUICK_ORDER_THRESHOLD_HOURS`, `STALE_QUICK_ORDER_THRESHOLD_MS` | Stale-order thresholds; check `getStaleQuickOrderRisks` consumer. |
| `src/owner-dashboard/owner-dashboard.queue.ts` | `OWNER_DASHBOARD_CACHE_VERSION` | Cache-busting key. |
| `src/customers/customer-core.service.ts` | `customerCoreSelect` | Prisma select fragment; verify no external composer. |
| `src/customers/sanitize-customer-360-view.ts` | `buildCustomerFriendlySummary` | Helper. |
| `src/finance/canonical-payment-method.ts` | `normalizePaymentMethodInput` | Possibly used by a deleted FE consumer. |
| `src/auth/capabilities.ts` | `AppPermission` | Re-export — verify if it's a barrel. |
| `src/branches/administrative-branch.util.ts` | `ROLES_THAT_SEE_ADMINISTRATIVE_BRANCHES` | Auth helper constant. |
| `src/bootstrap/ensure-default-price-list.ts` | `BUSINESS_NAME_AR` | Branding string. |
| `src/call-center/dto/mark-order-paid.dto.ts` | `MARK_PAID_METHODS` | Enum-like array. |
| `src/call-center/dto/record-partial-debt-payment.dto.ts` | `DEBT_PAYMENT_METHODS` | Same. |
| `src/common/constants/branding.ts` | `BRAND_CUSTOMER_EN`, `BRAND_SYSTEM_EN` | English brand strings; verify no FE / receipt template consumer. |
| `src/common/services/discord-alert.queue.ts` | `CRITICAL_DISCORD_EVENT` | Alert event identifier. |
| `src/common/services/payments.service.ts` | `UPAYMENTS_MAX_DIGIT_ONLY_INQUIRY_LEN` | Validation length. |
| `src/common/tracing/trace-context.ts` | `requestTraceId` | Legacy trace helper. |
| `src/common/tracing/request-async-context.ts` | `pickOrderIdFromRequest` | Helper. |
| `src/common/validation/kuwait-customer-phone.ts` | `KUWAIT_CUSTOMER_PHONE_PATTERN`, `pickFirstKuwaitMobileForWhatsApp` | Validation helpers. |
| `src/common/config/region.ts` | `isSecondaryRegion` | Region flag. |
| `src/domain-events/financial-domain-event.types.ts` | `FINANCIAL_DOMAIN_EVENT_PREFIX` | Event-name prefix. |
| `src/domain-events/realtime/financial-realtime.types.ts` | `REALTIME_CHANNELS` | Channel name list. |
| `src/fixed-expenses/fixed-expense.service.ts` | `countAccruedMonths` | Helper. |
| `src/users/password-policy.ts` | `passwordMinLength` | Policy constant; verify no validator import. |
| `src/system-config/system-config.service.ts` | `SYSTEM_CONFIG_ID` | Singleton row id. |
| `src/presence/presence.service.ts` | `PRESENCE_SWEEP_INTERVAL_MS` | Cron interval. |
| `src/presence/dto/presence.dto.ts` | `PRESENCE_SCOPE_KINDS` | Enum array. |
| `src/prisma/prisma.service.ts` | `guardAppendOnlyDelegate` | Append-only guard helper. |
| `src/serials/serial-counter.service.ts` | `ORDER_SERIAL_KEY` (`@deprecated`) | Marked `@deprecated` since "old DB" migration; safe to remove. |
| `src/tracing.ts` | `otelSdk` | OpenTelemetry SDK reference. |

| Total | 53 unused exports across 41 files |
|---|---|
| Recommended action | Surgical inlining / removal **AFTER** explicit per-file user approval. The Banking Core entries (§2.1.a) MUST be reviewed individually per Frozen Core Policy. The non-core entries (§2.1.b) can be batch-purged once the user signs off. |
| Risk | Low → Medium per export. Knip can produce occasional false positives when a symbol is referenced via dynamic Reflector metadata (Nest decorators) — every removal MUST be followed by a `tsc --noEmit` + `jest --runInBand` round-trip. |

---

### TIER 3 — MISSING DEPENDENCIES (real bugs to fix while we're here)

| Package | Used in | Status | Action |
|---|---|---|---|
| `multer` | `src/manager-custody/cash-flow-aliases.controller.ts` | Used at runtime via Nest's `FileInterceptor`, but not declared in `package.json`. Currently provided transitively by `@nestjs/platform-express`. | Add `multer` (and `@types/multer`) explicitly to `dependencies` so the runtime import is honest. |
| `express` | `src/main.ts` | False positive — provided transitively by `@nestjs/platform-express`. | No action. |
| `k6` | `scripts/load-bank-grade.js` | False positive — `k6` is a binary (not an npm pkg); the script declares the import for documentation only and is run via the k6 CLI. | No action. |
| `jsonwebtoken` | `scripts/verify-cash-status-bugfix.mjs` | Standalone diagnostic script; either add as devDep OR delete the obsolete script. | **Decision deferred to user.** |

---

### TIER 4 — LOW-CONFIDENCE / OUT-OF-SCOPE (do nothing this round)

| Finding | Why deferred |
|---|---|
| Knip's 187 unused FE exports (≈ 193 inside `web/src/lib/api.ts` alone) | False positives — `web/src/App.tsx` uses **42** dynamic `React.lazy()` / `import()` calls that knip can't trace without a `knip.json` config. Spot-checked: `getFinanceSalesDebtAnalytics` (added in Wave B) and `getExpensesSummary`/`getInvoices` are all flagged "unused" but verifiably consumed by pages. Mass action would silently delete production code. **Recommended:** create `knip.json` with `entry: ["web/src/main.tsx", "web/src/App.tsx", "web/src/pages/**/*.tsx"]` in a separate Station 3 effort, then re-evaluate. |
| `scripts/*.cjs` / `*.mjs` (`forensic-context`, `probe-*`, `verify-*`, `dispatch-*-smoke`, etc., ~25 files) | One-off operational/diagnostic scripts the team runs manually. No `package.json` script references them but the team relies on them ad-hoc. **Decision deferred to user** — recommend a Station 3 review with the team to keep/archive. |
| `load-test/` (artillery setup) | Separate sub-project with its own `package.json` and `package-lock.json`. Untouched. |
| `.tmp/`, `.turbo/`, `.cache/`, etc. | Already gitignored or absent. |

---

### TIER 5 — VERIFIED CLEAN (no action required, included for the audit trail)

| Discovery | Result |
|---|---|
| `.bak` / `.old` / `.deprecated` / `.legacy` / `.copy` / `.new` / `.tmp` / `.orig` / `.swp` / `.backup` / `~` files in `src/` or `web/src/` | **0 found** — no littered dead files. |
| Empty BE folders (no `.ts` files at all) | **0 found** — every BE module is populated. |
| Orphan `.spec.ts` files (a `*.spec.ts` whose `*.ts` partner is missing) | **0 real** (1 false positive: `src/finance/services/accountant-dashboard.integration.spec.ts` — `.integration.spec.ts` naming convention; sibling is `accountant-dashboard.service.ts`, alive and well). |
| Knip "unused files" on `src/` (BE source) | **0 found** — every BE source file is reachable from `main.ts` → `app.module.ts` → controllers / services / providers / cron / domain-event handlers. |
| Banking Core cross-pollination | **None** — Ledger / Aggregators / Snapshots / Reconciliation each own their files cleanly. |
| `@deprecated` markers in `src/` | **1 found** (`src/serials/serial-counter.service.ts:29` `ORDER_SERIAL_KEY`). Listed in §2.1.b as removable. |
| `@deprecated` markers in `web/src/` | **0 in source** (1 mention inside a test file's docstring is non-actionable). |

---

## 3. The Great Purge — proposed 4-step execution plan

> **Each step lists its own Green Matrix gate; we will NOT proceed to step N+1 if step N fails any gate.**

### Step A — Untrack `dist/` (one commit, 1,479 file deletions in the index)

| Detail | |
|---|---|
| Command | `git rm -r --cached dist/` (file system unaffected; only the git index entries are removed). |
| Pre-check | none (already gitignored). |
| Post-check | `git status` clean (no `dist/` entries); `npx jest --runInBand` 798/798; `cd web && npx vitest run` 259/259. |
| Risk | Zero. |
| Reversibility | A single `git checkout HEAD~1 -- dist/` restores everything if needed. |

### Step B — Delete the 6 empty FE module skeletons (6 directories, 6 README.md files)

| Detail | |
|---|---|
| Action | `Remove-Item -Recurse -Force web/src/modules/{accounting,customer360,dashboards,fraud,risk,subscribers}` |
| Pre-check | enumerated content above; only README files exist. |
| Post-check | `cd web && npx tsc --noEmit` (must stay 0 errors); `cd web && npx vitest run` (259/259). |
| Risk | Zero. |
| Reversibility | `git checkout HEAD -- web/src/modules/` restores. |

### Step C — Drop 11 unused FE deps + 5 unused BE deps

| Detail | |
|---|---|
| FE | `cd web && npm uninstall @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip next-themes react-leaflet @testing-library/user-event` |
| BE | `npm uninstall @google-cloud/storage @eslint/eslintrc source-map-support ts-loader tsconfig-paths` |
| Add (Tier 3 fix) | `npm install multer @types/multer --save` (declares the runtime dependency that `cash-flow-aliases.controller.ts` already uses transitively). |
| Pre-check | grep-verified zero source references for every uninstalled package; `multer` import verified at the controller line cited. |
| Post-check | Both `tsc --noEmit` runs at 0 errors; `cd web && npx vitest run` (259/259); `npx jest --runInBand` (798/798); `cd web && npm run build` and `npx tsc --noEmit -p tsconfig.json` (the Wave B baseline). |
| Risk | Low — the verification before delete is exhaustive. The single highest-risk drop is `@google-cloud/storage` (2.5 MB transitive); everything else is < 5 MB. |
| Reversibility | `git checkout HEAD -- package.json package-lock.json && npm install` restores. |

### Step D — Tier-2 dead-export inlining (53 exports across 41 files) — **OPT-IN PER USER APPROVAL**

| Detail | |
|---|---|
| Default | **DO NOT EXECUTE** without user explicit per-file or per-section sign-off. |
| Sub-batch B1 — Banking Core (§2.1.a, 7 files) | Frozen Core Policy: each removal is a separate review. **Recommend user reviews these last.** |
| Sub-batch B2 — Outside Core (§2.1.b, 34 files) | Can be batch-applied if user says "go" — each removal is one `export ` keyword stripped (or one line deleted). |
| Post-check (per batch) | Same Green Matrix as Step C. |
| Risk | Medium (knip false positives on Reflector-metadata symbols possible). |
| Reversibility | Trivial — each batch is its own commit. |

---

## 4. Estimated savings if all Tiers 1-3 are executed

| Metric | Before (V24-B baseline) | After (post Steps A-C) |
|---|---|---|
| Tracked files in repo | _baseline_ | **−1,485** (1,479 dist + 6 README) |
| Tracked bytes in repo | _baseline_ | **≈ −5.7 MB** (dist content) |
| `package.json` dependencies (FE) | 30 | **19** (−11) |
| `package.json` dependencies (BE) | 38 | **37** (−1 + 1 new = `multer`; −1 net) |
| `package.json` devDependencies (BE) | 30 | **25** (−5) |
| `package.json` devDependencies (FE) | 22 | **21** (−1) |
| `node_modules/` install size | _baseline_ | **≈ −45 to −65 MB** (Radix tree + leaflet + GCS) |
| Green Matrix | **89/89 BE • 798/798 PASS** + **39/39 FE • 259/259 PASS** | **MUST stay 89/89 • 798/798 + 39/39 • 259/259** (every step gate-checked) |

Tier 4 (Knip FE export false positives) is deliberately deferred to a future Station 3 once a `knip.json` config is in place to teach the analyser about the React-Router lazy-import topology.

---

## 5. Approval matrix — what we need from you

| Track | Recommendation | Needs your "go" |
|---|---|---|
| **Step A** — `git rm --cached dist/` | Strongly recommended (largest signal-to-noise win, zero risk). | YES |
| **Step B** — delete 6 empty FE module skeletons | Strongly recommended (zero risk, removes confusion about where features live). | YES |
| **Step C** — uninstall 11 + 5 unused deps + add `multer` | Strongly recommended (sizeable `node_modules` shrink, zero source impact). | YES |
| **Step D-1 (B1)** — inline 7 unused Banking Core exports | Optional / Frozen Core policy — review each one. | YES per file |
| **Step D-2 (B2)** — delete 34 unused non-core exports | Recommended; can be one bulk commit. | YES |
| **Tier 3 leftover** — keep `supertest`/`@types/supertest`? | Decide based on whether e2e specs will be revived. | YES / NO |
| **Tier 3 leftover** — delete `scripts/verify-cash-status-bugfix.mjs` (uses undeclared `jsonwebtoken`)? | If the script is no longer run, delete it; otherwise add `jsonwebtoken` to devDeps. | YES / NO |
| **Step E (Station 3)** — purge ad-hoc `scripts/*.cjs/*.mjs` that the team no longer uses | Defer to a separate Station 3 review with the team. | LATER |

---

## 6. Constraints you set & how this plan respects them

| Constraint | How this plan complies |
|---|---|
| **Zero Regression** (Green Matrix must stay 798/798) | Every step ends with the full backend `jest --runInBand` + frontend `vitest run` + both `tsc --noEmit` rounds. Any failure rolls back the offending change before Step N+1 begins. |
| **No Commented Code** | Step D removes `export` keywords cleanly — no `// dead` placeholders left behind. The Banking Core tunables that we recommend keeping are kept as **active** named constants, not as commented-out lines. |
| **Canonical Compliance** (KWD strings + Decimal.js + 4dp) | All purge targets are either non-money infrastructure (Radix, leaflet, GCS, etc.) or unused thresholds — no Banking Core canonical helper or DTO is altered. The two V24 lock-in specs (`v24-canonical-dto-purity.spec.ts` + `v24-reconciliation-baseline.spec.ts`) will run as part of every step's Green Matrix gate, so any accidental drift fails the build immediately. |

---

## 7. Next message expected from you

A single line is enough:

- **`A B C`** → execute Steps A + B + C exactly as proposed; defer D.
- **`A B C D`** → also execute D-2 (non-core 34 exports). D-1 still asks you per file.
- **`A`** / **`B`** / **`C`** individually → execute only that step.
- **`hold + question`** → ask anything before approval.

Nothing will be deleted until your reply.
