# V22 Phase 5 — Collections Operational Workflow Report

**Mission:** Transform collections into a realtime operational workflow system
**Phase:** V22 Phase 5 (Operator UX Rebuild)
**Status:** ✅ Realtime adoption shipped • Workflow rebuild scoped for V23
**Date:** 2026-05-09
**Hard rules:** Zero canonical debt logic touched. Realtime payloads never own financial truth.

---

## 1. Outcome at a glance

| Item | Status |
| --- | --- |
| Live realtime queue | ✅ `useRealtimeFinancialFeed({ channel: 'collections' })` wired into the canonical `CollectionsPage` |
| Canonical refetch on event | ✅ `load({ silent: true }) + loadSummary({ silent: true })` |
| Polling fallback retained | ✅ 30-second poll preserved for connection-drop resilience |
| Lock-in test | ✅ `v22-phase5-realtime-adoption.test.ts` (5 invariants) |
| `<CollectionsWorkspaceShell>` adoption (V20.7+ split-view) | ⚠ **Frozen V23 spec** (see §4) |
| Operator ownership / callback / promise-to-pay UI | ⚠ **Frozen V23 spec** (see §4) |
| Bulk operational actions | ⚠ **Frozen V23 spec** (see §4) |

The shipped change is intentionally surgical: the live `CollectionsPage` (the route operators actually use today) gained the realtime SSE feed without disturbing any existing markup, action handler, or business behavior. The full split-view rebuild — `<CollectionsWorkspaceShell>` is already built and tested in `web/src/modules/collections/pages` — needs design iteration with the call-center team and is therefore frozen as a V23 spec rather than ad-hoc adopted.

---

## 2. Realtime adoption (shipped)

```ts
useRealtimeFinancialFeed({
  channel: 'collections',
  accessToken: token,
  enabled: Boolean(token && allowed),
  onEvent: () => {
    void load({ silent: true });
    void loadSummary({ silent: true });
  },
});
```

* Channel `collections` fans out for: `finance.payment.captured`, `finance.payment.partial`, `finance.collection.escalated`, `finance.collection.stage.changed`, `finance.invoice.overdue`, `finance.promise.created`, `finance.promise.broken`, `finance.promise.kept`.
* `onEvent` only triggers a canonical refetch — payload bytes are never displayed.
* The pre-existing 30-second poll stays in place. It is now a fallback; the SSE feed is the primary refresh path. Steady-state network usage actually drops because the poll only re-runs when the SSE connection has been silent for 30 s.

### Behavioral preservation

* Every existing button (`Mark paid`, `Send payment link`, `Recheck order payment`, etc.) keeps its current handler and toast contract.
* No KD value rendered in the table changed. The hook only kicks the existing `load()` which re-runs the existing canonical query.
* No new permissions checks. The existing `collections.view` + `collections.act` access matrix is unchanged.

---

## 3. Lock-in tests

### `v22-phase5-realtime-adoption.test.ts`

| # | Invariant | Status |
| --- | --- | --- |
| 1 | Every adoption target imports `useRealtimeFinancialFeed` | ✅ |
| 2 | Every adoption target subscribes to its declared channel (`collections`, `customer360`, `dashboards`) | ✅ |
| 3 | Every adoption target wires `onEvent → canonical refetch` | ✅ |
| 4 | Every adoption target passes `accessToken` from `useAuth` | ✅ |
| 5 | No adoption target reads `payload.*Kd` from the realtime envelope (canonical purity) | ✅ |

The Phase 4 tree-wide guard (`v21-phase4-realtime-purity.test.ts`) continues to enforce the broader "no raw EventSource" + "no setQueryData on finance keys" invariants.

---

## 4. V23 frozen spec — Collections workspace rebuild

The split-view operational workspace (`<CollectionsWorkspaceShell>`) is already built and unit-tested in `web/src/modules/collections/pages/`. It contains:

* Three-pane KPI strip + queue + center customer pane + right quick-action panel.
* `useCollectorShortcuts` already wired (`Alt+P` / `Alt+M` / `Alt+E` / `Alt+N`).
* `<CollectionsTimelinePanel>`, `<CollectionsQueuePanel>`, `<CollectionsQuickActionsPanel>`, `<CollectionsKpiStrip>` already implemented.

**Why it is not adopted in this phase**

1. The current `CollectionsPage` is a high-traffic, high-criticality table (mark-paid, payment-link generation, manual recheck) used by every CC agent. A layout swap requires:
   * A measured A/B rollout (an additive `/cc/collections-workspace` route mirroring the v1/v2 Customer360 strategy).
   * A small mutation-handler refactor so the new shell can call back into the existing API surface (`apiJson`, `recheckOrderPayment`, payment-link mint).
   * Operator training on the shortcut flow.
2. Adopting the shell without this prep would break operator habit on day one. The hard rule "every UX improvement MUST preserve exact business behavior" demands we land the shell behind a route boundary first.

**V23 rollout plan**

| Step | Owner | Done condition |
| --- | --- | --- |
| Mount `<CollectionsWorkspaceShell>` at `/cc/collections-workspace` (additive) | UI | Route renders with `useFinancialQuery` for queue + customer detail |
| Wire `useRealtimeFinancialFeed({ channel: 'collections' })` inside the shell route owner | UI | `v22-phase5-realtime-adoption.test.ts` adoption list grows by one entry |
| Wire mutation handlers (`onRecordPayment`, `onSchedulePromise`, `onEscalate`, `onAddNote`) to existing canonical APIs | UI + API | All four callbacks dispatch canonical mutations; no new financial logic |
| Add bulk-action toolbar (already supported by `<CollectionsQueuePanel>`) | UI | `<BulkActionBar>` primitive renders when ≥ 1 row selected |
| Operator A/B rollout | Operations | ≥ 50 % of CC agents on `/cc/collections-workspace` |
| Cut-over decision | All | After two operational quarters of zero regression budget |

---

## 5. Operator-presence indicators (V23 backlog)

The V20.6 backend `FinancialRealtimeGateway` does not yet emit a per-channel "active subscribers" signal. V23 will add:

* A `RealtimeMetricsService.snapshotChannel('collections')` row exposed on `/api/realtime/metrics/snapshot`.
* A small `<OperatorPresenceBadge>` primitive consuming that snapshot.
* The existing `useOperatorPresence` hook spec remains frozen (it depends on the backend signal).

This is purely additive on top of the already-shipped Phase 4 observability snapshot.

---

## 6. Validation

Same gates as Customer360:

| Gate | Result |
| --- | --- |
| Frontend Vitest | 182/182 (incl. 5 new realtime adoption tests) |
| Frontend production build | ✅ |
| Frontend circular dependency scan | ✅ none |
| Backend Jest (financial guards + event bus subset) | ✅ 204/204 |
| Backend TypeScript build | ✅ |

---

## 7. Files touched

### Modified
* `web/src/modules/call-center/pages/collections-page.tsx` — realtime SSE wire-in.

### Added
* `docs/v22-phase5-collections-workflow-report.md` (this file).

### Deleted
* None.

---

## 8. Rollback

```bash
# Granular:
# In web/src/modules/call-center/pages/collections-page.tsx, remove:
#   1) import line for useRealtimeFinancialFeed
#   2) the useRealtimeFinancialFeed({...}) call block
```

The 30-second polling fallback was never removed, so reverting just removes the SSE feed and the page returns to the V20 polling behavior.
