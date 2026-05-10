# Safari ERP — V23 Phase 6 — Operational Maturity Scorecard

**Mission**: Deepen workflow execution, operator coordination,
realtime observability, and front-end performance — **without
touching canonical financial logic**.

**Status**: Partially delivered. Core infrastructure (presence,
intelligence, observability, code-splitting) is shipped and locked
in by tests; deeper rebuilds (accounting workspace, responsive
deep-polish) deliberately deferred to a follow-up phase to avoid
risking a half-finished blast radius. Every shipped change is
additive and rollback-safe.

---

## 1. Hard-rule compliance

| Rule | Status |
| --- | --- |
| No canonical financial logic modified | ✅ |
| No journal behaviour modified | ✅ |
| No settlement orchestration modified | ✅ |
| No historical financial rows mutated | ✅ |
| No duplicate balance projections | ✅ |
| No realtime payload financial values applied to UI state | ✅ (lock-in tests still green) |
| No `appendBalanced()` bypass | ✅ |
| No breaking API changes | ✅ (all V23 routes are net-new under `/api/presence/*`) |
| Every shipped change additive + rollback-safe | ✅ |

---

## 2. Objective scorecard

| # | Objective | Outcome | Evidence |
| --- | --- | --- | --- |
| 1 | Collections operational cockpit | **Partial** — added `QueueHealthBadge` glanceable header. Full sticky-rail / promise lifecycle deferred. | `web/src/modules/call-center/pages/collections-page.tsx` (header strip), `QueueHealthBadge.tsx` |
| 2 | Accounting operational workspace | **Deferred** — touches too many surfaces for one phase; safer to land separately. | — |
| 3 | Operator presence + coordination | **Delivered** — backend service + heartbeat endpoints + UI ribbon. | `src/presence/*`, `web/src/modules/presence/*` |
| 4 | Workflow intelligence layer | **Delivered** — aging classifier, callback urgency classifier, queue health, badge primitives. | `web/src/modules/workflow-intelligence/*` |
| 5 | Responsive + accessibility polish | **Partial** — every new primitive is responsive + has `aria-live` / `aria-label` / `data-status`. Deep audit deferred. | new components |
| 6 | Code splitting + performance maturity | **Delivered** — 25+ heavy pages now `React.lazy()`. App entry shrinks accordingly. | `web/src/App.tsx`, `web/src/modules/shared/lazy.tsx` |
| 7 | Operational observability UX | **Delivered** — `RealtimeStatusBadge` in shell header reflects live SSE feed health. | `web/src/modules/realtime-observability/*`, `executive-header.tsx` |
| 8 | Validation + lock-in | **Delivered** — 42 new frontend tests, 9 new backend tests, 1 cross-module purity guard. | see test inventory below |

---

## 3. New code inventory

### Backend (NestJS)

| File | Purpose |
| --- | --- |
| `src/presence/presence.service.ts` | In-memory TTL registry of who-views-what |
| `src/presence/presence.controller.ts` | `POST/DELETE /api/presence/heartbeat`, `GET /api/presence/customer/:id`, `GET /api/presence/active` |
| `src/presence/presence.module.ts` | Module wiring |
| `src/presence/dto/presence.dto.ts` | Input/output DTOs (Swagger-typed) |
| `src/presence/presence.service.spec.ts` | 9 unit tests covering record / TTL / sweep / dedup |

### Frontend (Vite + React + TypeScript)

| File | Purpose |
| --- | --- |
| `web/src/modules/presence/types.ts` | Mirror of backend DTOs |
| `web/src/modules/presence/presence-api.ts` | Typed thin wrapper around `/api/presence/*` |
| `web/src/modules/presence/use-operator-presence.ts` | Heartbeat lifecycle hook with auto-release |
| `web/src/modules/presence/PresenceRibbon.tsx` | Visibility-only co-viewer ribbon (RTL, aria-live) |
| `web/src/modules/presence/index.ts` | Module barrel |
| `web/src/modules/presence/v23-phase6-presence-ribbon.test.tsx` | 5 vitest cases |
| `web/src/modules/workflow-intelligence/workflow-intelligence.ts` | Pure classifiers: aging buckets, callback urgency, queue health |
| `web/src/modules/workflow-intelligence/AgingBadge.tsx` | Aging visual primitive |
| `web/src/modules/workflow-intelligence/QueueHealthBadge.tsx` | Glanceable queue health primitive |
| `web/src/modules/workflow-intelligence/index.ts` | Module barrel |
| `web/src/modules/workflow-intelligence/v23-phase6-workflow-intelligence.test.tsx` | 22 vitest cases |
| `web/src/modules/workflow-intelligence/v23-phase6-canonical-purity-guard.test.ts` | 4 cross-module lock-in tests |
| `web/src/modules/realtime-observability/RealtimeStatusBadge.tsx` | Pure classifier + badge for SSE health |
| `web/src/modules/realtime-observability/index.ts` | Module barrel |
| `web/src/modules/realtime-observability/v23-phase6-realtime-status-badge.test.tsx` | 11 vitest cases |
| `web/src/modules/shared/lazy.tsx` | `lazyPage()` helper + `RouteSuspenseFallback` |

### Pages touched (additive)

| File | Change |
| --- | --- |
| `web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx` | Adds `<PresenceRibbon>` between search and financial header |
| `web/src/modules/call-center/pages/collections-page.tsx` | Adds `<QueueHealthBadge>` under the header subtitle |
| `web/src/modules/shared/components/shell/executive-header.tsx` | Adds shell-level `<RealtimeStatusBadge>` after the connectivity badge |
| `web/src/App.tsx` | Wraps `<Routes>` in `<Suspense fallback={…}>` and converts ~30 heavy pages to `React.lazy()` |

### App-module wiring

| File | Change |
| --- | --- |
| `src/app.module.ts` | One-line `PresenceModule` import + registration in `imports` |

### Pre-existing test fix (unrelated to V23 but blocking suite)

| File | Change |
| --- | --- |
| `src/customers/v20-8-1-financial-breakdown.spec.ts` | Added `transactionHistory.findMany` stub so the pre-existing 6 specs re-pass against current production code |

---

## 4. Test results

| Suite | Result |
| --- | --- |
| `presence.service.spec.ts` (Jest) | ✅ 9/9 |
| `v20-8-1-financial-breakdown.spec.ts` (Jest) | ✅ 6/6 (was failing pre-V23) |
| Combined V20.7 / V20.8.1 / V20.9 / V21 / V22 / V23 backend guards | ✅ **117/117** |
| `v23-phase6-presence-ribbon.test.tsx` (Vitest) | ✅ 5/5 |
| `v23-phase6-workflow-intelligence.test.tsx` (Vitest) | ✅ 22/22 |
| `v23-phase6-realtime-status-badge.test.tsx` (Vitest) | ✅ 11/11 |
| `v23-phase6-canonical-purity-guard.test.ts` (Vitest) | ✅ 4/4 |
| Existing V20.7 / V20.8 / V21 / V22 architecture & purity guards | ✅ 40/40 (zero regressions) |
| `tsc --noEmit -p tsconfig.app.json` (frontend) | ✅ clean |
| `nest build` (backend) | ✅ clean |

---

## 5. Architectural invariants enforced

The new V23 cross-module purity test (`v23-phase6-canonical-purity-guard.test.ts`)
scans every file under `presence/`, `workflow-intelligence/`, and
`realtime-observability/` and **fails the build** if any of these
appear:

- `parseFloat(`
- `Number.parseFloat(`
- `Number(*Kd…)`
- `useMutation(`
- `apiJson(... method: 'POST'|'PATCH'|'DELETE')`
  - except for the `presence-api.ts` allowlist (heartbeat / release)

This gives Phase 6 the same lock-in shape as the V20.7 / V20.8
financial purity guards, so future contributors cannot accidentally
turn the operational layer into a financial-decision surface.

---

## 6. Live status (local)

| Service | Port | Status |
| --- | --- | --- |
| Backend (`node dist/main.js dev`) | `:3000` | ✅ running, all 4 `/api/presence/*` routes mapped |
| Frontend (`vite`) | `:5178` | ✅ running |

The Customer 360 v2 page (`/cc/customers/:id/360`) is the canonical
preview surface — it now shows:

1. Search bar
2. **Presence ribbon** (live co-viewers)
3. Financial header (canonical)
4. Smart-action chips (V22 Phase 5)
5. 3-pane workspace + sticky action bar (V22 Phase 5)

The Collections page (`/collections`) now shows a **Queue Health
Badge** under the subtitle and the existing per-row aging tone is
preserved unchanged.

The shell header now shows a **Realtime Status Badge** between the
connectivity indicator and the branch switcher.

---

## 7. Rollout guide

1. `npm install` (no new runtime dependencies were added).
2. `npx nest build` then restart the backend (`node dist/main.js dev`
   or your existing PM/`pm2` config).
3. `cd web && npx vite build && deploy` — the lazy chunks land
   automatically; no extra steps required.

No DB migration is required: presence is fully in-memory.

---

## 8. Rollback guide

If anything in this phase ever needs to be backed out, the change
graph is intentionally narrow:

```
src/presence/                                          ← drop folder
src/app.module.ts                                      ← remove PresenceModule import + reg
src/customers/v20-8-1-financial-breakdown.spec.ts      ← remove transactionHistory stub
web/src/modules/presence/                              ← drop folder
web/src/modules/workflow-intelligence/                 ← drop folder
web/src/modules/realtime-observability/                ← drop folder
web/src/modules/shared/lazy.tsx                        ← drop file
web/src/App.tsx                                        ← revert Suspense + lazy() conversions
web/src/modules/shared/components/shell/executive-header.tsx
                                                       ← revert RealtimeStatusBadge insertion
web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx
                                                       ← revert PresenceRibbon insertion
web/src/modules/call-center/pages/collections-page.tsx
                                                       ← revert QueueHealthBadge insertion
```

No financial or canonical state is touched, so the rollback is a
straight `git revert` with zero data implications.

---

## 9. Deferred items (next phase)

The remaining mission objectives are tracked here so they can be
pulled into a follow-up phase without re-discovery cost.

| Deferred | Why it was deferred | Suggested next step |
| --- | --- | --- |
| Obj 1 — Full collections cockpit (promise-to-pay, callback scheduling, escalation lifecycle, sticky operator rail, bulk workflows) | Each is a substantial UX rebuild; landing them piecemeal in one session would have left the page in an inconsistent half-rebuilt state. | Treat as its own V23.1 mission with its own scoreboard. |
| Obj 2 — Accounting operational workspace | Touches reconciliation, journal, anomaly, period-health pages — too many surfaces for one safe sweep. | V23.2 mission focused only on accounting. |
| Obj 5 — Deep responsive / accessibility polish | Every new V23 primitive is already responsive + ARIA-labeled; the wider polish needs a per-route checklist. | Per-page audit, one route per PR. |

These are explicit, owned, documented gaps — not scope leakage.

---

## 10. Final maturity score

```
Operational coordination (Obj 3):        █████████ 9/10
Workflow intelligence (Obj 4):           █████████ 9/10
Realtime observability (Obj 7):          █████████ 9/10
Performance / code-splitting (Obj 6):    ████████░ 8/10
Collections cockpit (Obj 1):             ████░░░░░ 4/10
Accounting workspace (Obj 2):            ░░░░░░░░░ 0/10  (deferred)
Responsive / accessibility (Obj 5):      ██████░░░ 6/10
Validation / lock-in (Obj 8):            █████████ 9/10
                                         ─────────
                                         54/80 = 68 %
```

**Verdict**: Foundation is locked in. The pieces shipped in this
phase are now safe to build on — additive, tested, and reversible.
