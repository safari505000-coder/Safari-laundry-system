# V20.6 — Phase 7: Collections Operations Workspace

> **Status:** ✅ **PASSED** — 51/51 frontend tests, frontend `tsc -b` clean. Workspace mounts with realistic props, keyboard shortcuts dispatch correctly, ARIA chrome verified.

This document records the Phase 7 transformation of the call-center surface into a **Collections Operations Workspace** — a single keyboard-first page that fuses the canonical financial state, collections workflow, observability, and timeline into one place.

---

## 1. Architecture explanation

The workspace is **one page** assembled from already-tested primitives:

```
┌────────────────────────────────────────────────────────┐
│ KPI Strip   (uses /api/finance/observability/overview) │
├────────────────────────────────────────────────────────┤
│ Hero (DebtCard) │  Timeline                            │
│ Signal strip    │  (WindowedList of TimelineCard)      │
│ Notes panel     │                                      │
├────────────────────────────────────────────────────────┤
│ Sticky Action Bar   [Pay Alt+P] [Promise Alt+M] …      │
└────────────────────────────────────────────────────────┘
```

**Composition over invention.** Every visual primitive on this page is a Phase 6 UI Kit component. The workspace adds:

1. **Collector keyboard shortcuts** (`useCollectorShortcuts`) — Alt+P, Alt+M, Alt+E, Alt+N.
2. **Workspace-shaped DTOs** (`WorkspaceTimelineRow`, `WorkspaceNote`) that map cleanly onto the Customer 360 + observability endpoints.
3. **Three workspace components** (`CollectionsActionBar`, `CollectionsKpiStrip`, `CollectionsWorkspaceHero`, `CollectionsTimelinePanel`).
4. **Presentational page** (`CollectionsOperationsWorkspace`) — accepts pre-loaded data via props and emits intent through callbacks. No data fetching is hidden inside the page; the route shell wires it.

This separation of concerns means the workspace is **fully testable in isolation** — no network mocking needed, since data and callbacks are props.

---

## 2. Invariants enforced

| # | Invariant | Mechanism |
| --- | --- | --- |
| W-1 | **Server canonical only.** The hero shows pre-aggregated KD figures from the server; no client-side debt math. | `DebtCard` accepts string KD fields verbatim; `CollectionsHeroData` shape mirrors the server payload |
| W-2 | **Virtualized history.** A 10K-event customer history mounts with ~ 20 DOM rows. | `CollectionsTimelinePanel` uses `WindowedList` with `rowHeight=88` |
| W-3 | **Keyboard shortcuts cannot stomp on text input.** All collector shortcuts require the **Alt** modifier. | `useCollectorShortcuts` short-circuits when `e.altKey` is false |
| W-4 | **Shortcut handler errors do not crash the workspace.** | `useCollectorShortcuts` wraps each invocation in `try/catch` and logs |
| W-5 | **KPI strip degrades gracefully.** A failed observability fetch shows "KPIs offline" without unmounting the workspace. | `CollectionsKpiStrip` early-returns on `error` / `loading` / null |
| W-6 | **Action buttons advertise their shortcut for screen readers.** | Each button sets `aria-keyshortcuts="Alt+X"` |
| W-7 | **Click-to-dial.** The customer phone is rendered as a `tel:` link so it's one tap away on tablet. | `CollectionsWorkspaceHero` `<a href="tel:…">` |

---

## 3. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| The page accepts pre-loaded data via props; the route shell still has to fetch it. | LOW | Phase 6 already provides `useFinancialQuery` + `useObservabilityOverview`; the route shell just calls them. |
| Alt+letter shortcuts collide with screen-reader keystrokes on Windows. | LOW | Collector primary surface is the tablet (touch-first); the shortcut layer is an opt-in accelerator, not the only way to act. |
| The Customer 360 endpoint does not yet expose the full timeline DTO this workspace expects. | MEDIUM | The page accepts an empty array gracefully (renders the empty-state). Server timeline endpoint can ship in a follow-up — the workspace ships now with a placeholder feed. |
| Notes panel is read-only at the moment. | LOW | The shape is forward-compatible; the dedicated `Add Note` modal will write through the existing CC notes endpoint. |

---

## 4. Exact files changed

### New files

| Path | Purpose |
| --- | --- |
| `web/src/modules/collections/index.ts` | Module barrel surface |
| `web/src/modules/collections/types/workspace.ts` | `WorkspaceTimelineRow`, `WorkspaceNote`, `WorkspacePromise` |
| `web/src/modules/collections/hooks/use-collector-shortcuts.ts` | Alt+letter keyboard binder |
| `web/src/modules/collections/components/CollectionsActionBar.tsx` | Sticky bottom action bar with shortcut chips |
| `web/src/modules/collections/components/CollectionsKpiStrip.tsx` | Observability-fed KPI strip |
| `web/src/modules/collections/components/CollectionsWorkspaceHero.tsx` | DebtCard + signal strip composition |
| `web/src/modules/collections/components/CollectionsTimelinePanel.tsx` | Virtualized timeline panel |
| `web/src/modules/collections/pages/CollectionsOperationsWorkspace.tsx` | Workspace page |
| `web/src/modules/collections/pages/collections-operations-workspace.test.tsx` | 9 smoke tests |

### Modified files

None. **Phase 7 is strictly additive** — the existing CC `cc-customer-360-page.tsx` is unchanged and still served behind `/cc/:customerId/360`. The new workspace can be wired to a new route (e.g. `/cc/:customerId/collections`) in a follow-up route-only PR; no behaviour changes for existing operators.

---

## 5. Migrations

None — Phase 7 is **frontend-only**.

---

## 6. APIs added

None. Phase 7 reuses:

- `GET /api/customers/:id/360` — feeds the Hero
- `GET /api/finance/observability/overview` — feeds the KPI strip (Phase 3, hooked in Phase 6)

The server timeline endpoint (`GET /api/finance/timeline?customerId=…`) already exists in V20.5; future PR will format its rows into `WorkspaceTimelineRow` shape via a thin adapter.

---

## 7. Tests added

| Suite | Count | Focus |
| --- | --- | --- |
| `collections-operations-workspace.test.tsx` | 9 | Mount path; ARIA chrome; action-button shortcut chip; Alt+P / Alt+E click + keypress dispatch; non-Alt key NO-OP; KPI-strip error degrade; KPI-strip loaded path; empty timeline; tel: link |
| **Total** | **9** | — |

Combined with prior phases: **51/51 frontend tests pass.**

---

## 8. Concurrency validation

- Workspace state is fully props-driven; nothing in the page mutates outside React state. No concurrency hazards inside the page itself.
- Shortcuts: even if two key events arrive in the same tick, each handler is a synchronous callback fire — no shared mutable state in the binder.

---

## 9. Idempotency validation

- The Hero is pure — same props produce the same output.
- Action callbacks are passed by reference and called at most once per click / keystroke.
- The KPI strip never writes; idempotency is delegated to the observability endpoint (which is read-only anyway).

---

## 10. Drift validation

- The page never derives KD figures; it renders strings the server produced.
- The timeline panel renders events in the order the server returned them — no client-side resort.
- The KPI strip rebuilds the score pill verbatim from the server's `healthScore`.

---

## 11. Rollout plan

1. **Ship now, route later.** The workspace component exists in `modules/collections/index.ts` but is not yet wired to a route. A follow-up one-line PR adds `/cc/:customerId/collections` to `App.tsx`, gated by `RequireAccess access="ccDashboard.view"`.
2. **Pilot.** Pick one branch's CC team to run on the new workspace for a week before the wider rollout.
3. **Telemetry.** Add a single `collections_workspace_action` event (action id + customer id) so we can confirm collectors are using shortcuts vs clicks.
4. **Existing 360 page stays.** No deprecation in this phase; the workspace runs side-by-side until the team is satisfied.

---

## 12. Rollback plan

Phase 7 is **purely additive frontend**. Rollback strategy:

1. Delete the route entry once added (one-line revert in `App.tsx`).
2. Optionally delete `web/src/modules/collections/` entirely.

No DB rollback, no backend code change, no existing surface affected.

---

## 13. Validation log

```
$ npx vitest run --reporter=default
 Test Files  7 passed (7)
      Tests  51 passed (51)

$ npx tsc -b --pretty false
(exit 0, no output)
```

Phase 7 is complete. Phase 8 (final forensic validation) starts now.
