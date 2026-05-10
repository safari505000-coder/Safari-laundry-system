# V21 Phase 3 — Implementation Report

> Per-wave change log for Phase 3. Every wave preserved
> exact business behaviour and was validated before the
> next began.

---

## Wave 0 — Audit (read-only)

  * Surveyed all 9 named operational surfaces.
  * Surveyed existing keyboard / command-palette infrastructure.
  * Discovered the V20.9 `CommandPalette` + `useGlobalShortcut`
    were built and tested but never wired into the running app.
  * Output: `docs/v21-phase3-operational-ux-audit.md`.

## Wave 1 — Global Command Palette wrapper

### Files added

| File | Lines | Purpose |
|------|-------|---------|
| `web/src/modules/shared/components/command/GlobalCommandPalette.tsx` | 144 | Wraps `CommandPalette`, registers `Ctrl/Cmd+K`, exposes a curated role-aware command set |

### Files modified

| File | Lines changed | Purpose |
|------|---------------|---------|
| `web/src/modules/shared/components/shell/executive-shell.tsx` | +9 / -0 | Imports `GlobalCommandPalette` and renders it once at shell level |

### Behavioural guarantees

  * **Ctrl/Cmd + K** opens the palette from any authenticated route.
  * **Esc** closes it.
  * **Empty query** renders the role-filtered default command set
    (ranked by the existing V20.9 `rank-commands.ts`).
  * **Roles enforce visibility** — drivers see Dashboard + POS only;
    operators / accountants see the full set.
  * **Zero financial side-effect** — palette only navigates.
    No fetch, no `apiJson`, no canonical money helpers, no Prisma.

### Validation gate

```
npx tsc -p tsconfig.app.json --noEmit       → 0 errors
npm run build                               → built in 1.27s, 0 errors
npx vitest run command/v20-9-command-palette → 7/7 ✅ (existing palette tests still green)
```

## Wave 2 — Lock-in tests

### Files added

| File | Lines | Purpose |
|------|-------|---------|
| `web/src/modules/shared/components/command/v21-phase3-global-palette.test.tsx` | 159 | 8 tests asserting wiring + behaviour |

### Test breakdown

| # | Test | What it asserts |
|---|------|------------------|
| 1 | ExecutiveShell imports GlobalCommandPalette | Source-string regex on the shell |
| 2 | ExecutiveShell renders `<GlobalCommandPalette />` | Source-string regex on the shell |
| 3 | GlobalCommandPalette uses canonical `useGlobalShortcut` with key='k', mod='mod' | Source-string regex on the wrapper |
| 4 | GlobalCommandPalette has zero financial side-effects | Forbidden-pattern scan: `fetch(`, `apiJson`, `apiFetch`, `sumKwdStrings`, `formatKwdAmount`, `isPositiveKd`, `isNegativeKd`, `isZeroKd`, `isMaterialKd`, `compareKwdStrings`, `prisma` |
| 5 | GlobalCommandPalette only navigates | Required-pattern scan: `useNavigate`, `react-router-dom` |
| 6 | Ctrl+K opens the palette dialog | Real DOM render + keyDown event + `[role="dialog"]` assertion |
| 7 | Esc closes the open palette | Real DOM render + keyDown sequence |
| 8 | Default command set surfaces dashboard target | Real DOM render + textContent regex |

### Validation gate

```
npx vitest run command/v21-phase3-global-palette → 8/8 ✅
```

## Wave 3 — Specifications

### Files added

| File | Purpose |
|------|---------|
| `docs/v21-phase3-customer360-rebuild-spec.md` | V22 Customer360 3-pane operational command center spec (frozen contract: C-1 … C-7) |
| `docs/v21-phase3-workflow-redesign-report.md` | Per-workflow redesign blueprint, brackets WIRE_NOW vs DESIGN_AND_BUILD_V22 |
| `docs/v21-phase3-responsive-validation.md` | Responsive validation report |
| `docs/v21-phase3-accessibility-report.md` | Accessibility report |
| `docs/v21-phase3-performance-validation.md` | Performance validation report |
| `docs/v21-phase3-ux-scorecard.md` | Final scorecard + rollback guide |

These are **deliverables**, not implementations — they
freeze the design contracts V22 must satisfy. Implementation
of those specs is intentionally deferred to V22 because:

  * Customer360 rebuild touches multiple panes and requires
    real operator design input — committing to one design
    in this single pass would be irresponsible.
  * Each V22 deliverable still gets the same architectural
    safety net the rest of the codebase has (canonical
    money helpers, single source of truth, lock-in tests).

---

## Validation summary

| Gate | Result | Notes |
|------|--------|-------|
| `tsc -p tsconfig.app.json --noEmit` | ✅ 0 errors | Frontend |
| `npm run build` (frontend) | ✅ 1.27s | Same 2.68 MB main chunk; code-split for V22 |
| `nest build` (backend) | ✅ 19s | Clean |
| Frontend Vitest | ✅ **154/154** (28 files) | Includes new 8 Phase 3 tests + 7 V20.9 palette tests |
| Backend Jest | ✅ **723/745** (78 files) | 1 pre-existing failure (`security-rbac.spec.ts:134`, documented in V21 Phase 1 + Phase 2 validation reports), 21 intentionally skipped |
| `madge --circular` | ✅ No circular dependency | Frontend |

---

## Hard-rules audit

| Rule | Status |
|------|--------|
| DO NOT modify canonical financial logic | ✅ Zero source files outside `web/src/modules/shared/components/` touched |
| DO NOT alter settlement behaviour | ✅ No backend code touched |
| DO NOT change journal logic | ✅ No backend code touched |
| DO NOT mutate financial calculations | ✅ Wrapper has zero money helpers (lock-in test 4) |
| DO NOT introduce API breaking changes | ✅ No API touched |
| DO NOT create duplicate financial projections | ✅ Wrapper has zero data fetches (lock-in test 4 + 5) |
| Every UX improvement preserves exact business behaviour | ✅ Wrapper is purely additive — opens a palette that runs `navigate(...)` |

---

## Deliverables checklist

  * [x] `docs/v21-phase3-operational-ux-audit.md`
  * [x] `docs/v21-phase3-implementation.md` (this file)
  * [x] `docs/v21-phase3-customer360-rebuild-spec.md`
  * [x] `docs/v21-phase3-workflow-redesign-report.md`
  * [x] `docs/v21-phase3-responsive-validation.md`
  * [x] `docs/v21-phase3-accessibility-report.md`
  * [x] `docs/v21-phase3-performance-validation.md`
  * [x] `docs/v21-phase3-ux-scorecard.md` (includes rollback guide)
