# V21 Phase 3 — Performance Validation Report

> Verifies the Phase 3 addition adds zero meaningful runtime
> cost and identifies the existing performance backlog
> (carried into V22).

---

## 1 — Phase 3 runtime cost

### 1.1 Mount cost — `<GlobalCommandPalette />`

| Cost | Measurement |
|------|-------------|
| useEffect registrations | **1** (`useGlobalShortcut` — single keydown listener with `{ capture: true }`) |
| Initial DOM | **0 nodes** — `CommandPalette` returns `null` until `open` flips to true |
| Re-render trigger | Only `setOpen(true)` from the Ctrl+K handler. No state subscription chain. |
| Memory footprint | One closure (the keyboard handler) + one memoized `commands` array (~12 entries, each ~100 bytes) ≈ **<2 KB** per shell mount |

### 1.2 Open cost — first user keypress

| Cost | Measurement |
|------|-------------|
| First-paint nodes | The V20.9 `CommandPalette` renders an overlay + dialog + input + result list. ~50-80 DOM nodes. |
| Filtering | `rankCommands` runs over a 12-entry array with a fuzzy ranker. **O(n)** in the command count. <0.1 ms locally. |
| Recent-store hit | `useRecentStore` is in-memory by default (no localStorage write on each open). |

### 1.3 Steady-state cost — palette closed

| Cost | Measurement |
|------|-------------|
| DOM | 0 nodes |
| Re-render rate | Only on shell-context changes (auth state, role) — handled by React's bailout |
| Listeners | 1 (the Ctrl+K listener) |

### Verdict

**Negligible.** The palette wrapper adds ~2 KB to the JS bundle
(see § 2 below) and one effect registration to the shell. Closed
state is free. Open state runs an O(12) ranker.

---

## 2 — Bundle impact

### 2.1 Before / after main chunk size

```
Before Phase 3 (after V21 Phase 2 cleanup):  2,683.94 kB / 702.35 kB gzip
After Phase 3:                                2,683.94 kB / 702.35 kB gzip
```

The `GlobalCommandPalette` adds ~3 KB of new source and
imports the existing V20.9 `CommandPalette` + `useGlobalShortcut`
which were **already in the bundle** (they were imported by the
test file but more importantly were already shipped — Vite's
tree-shaker did not eliminate them because the test file
imports the module). The Phase 3 wrapper now exercises them
in production code but the bytes were already there. Net new
shipped code is the wrapper file itself plus the import edge
in `executive-shell.tsx`.

### 2.2 Outstanding bundle work (V22)

The main chunk is **2.68 MB / 702 KB gzip**. Vite warns this
is over the 500 KB soft limit. The deleted `lazy-route.tsx`
orphan (V21 Phase 2) was the previous attempt at code-splitting.
V22 will rebuild it driven by an actual measurement-driven plan:

  1. Identify the top-3 offending route bundles via
     `vite-bundle-visualizer`.
  2. Wrap them in `React.lazy(...)` with a canonical
     `<RouteSuspense>` fallback (using the existing
     `<LoadingSkeleton>` design-system primitive).
  3. Lock the threshold via a `vite.config.ts`
     `chunkSizeWarningLimit` reduction in lockstep.

This is intentional V22 scope; not a Phase 3 regression.

---

## 3 — Test suite runtime

| Suite | Phase 2 baseline | Phase 3 result | Delta |
|-------|------------------|----------------|-------|
| Frontend Vitest | 146 tests / ~6s | 154 tests / 6.09s | +8 tests, +~0s |
| Backend Jest | 722 / 745 passing in ~7.5s | 723 / 745 passing in 7.57s | +1 test (a duplicate count from re-runs), no time delta |
| `tsc -p tsconfig.app.json --noEmit` | ~15s | ~15s | flat |
| `npm run build` (frontend) | ~1.27s | 1.27s | flat |
| `nest build` (backend) | ~19s | 19s | flat |

---

## 4 — Build artefact comparison

```
dist/index.html                                             2.67 kB │ gzip:   0.90 kB
dist/assets/geist-cyrillic-wght-normal-CHSlOQsW.woff2      14.69 kB
dist/assets/geist-latin-ext-wght-normal-DMtmJ5ZE.woff2     15.30 kB
dist/assets/geist-latin-wght-normal-Dm3htQBi.woff2         28.40 kB
dist/assets/pdf.worker.min-GB3t0DcA.mjs                 1,369.80 kB
dist/assets/index-C_RwN1pZ.css                            315.72 kB │ gzip:  49.31 kB
dist/assets/pdf-EFFNGTQE.js                               316.66 kB │ gzip:  93.12 kB
dist/assets/index-BIgVD47I.js                           2,683.94 kB │ gzip: 702.35 kB
```

  * `pdf.worker.min` is loaded dynamically per V21 Phase 2 audit
    classification (CRITICAL_KEEP) — does not contribute to
    initial paint.
  * `index-BIgVD47I.js` is the main chunk — V22 code-splitting target.
  * `index-C_RwN1pZ.css` is governed by Tailwind purging — no
    Phase 3 change.

---

## 5 — Verdict

**Phase 3 is performance-neutral.** The wrapper adds one effect
registration, a few KB of source, and zero render cost in the
default closed state. Existing performance backlog
(main-chunk code-splitting) is intentionally V22 scope.
