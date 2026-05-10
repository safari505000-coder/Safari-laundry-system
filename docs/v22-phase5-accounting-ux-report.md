# V22 Phase 5 — Accounting UX Report

**Mission:** Normalize accounting workflows around operational execution
**Phase:** V22 Phase 5 (Operator UX Rebuild)
**Status:** ⚠ **Audit + frozen V23 spec** (no canonical accounting code touched in this phase)
**Date:** 2026-05-09
**Hard rules:** Zero canonical journal logic touched. Zero settlement orchestration touched. Zero historical financial data touched.

---

## 1. Executive summary

The accounting surface was audited in V21 Phase 3 (`docs/v21-phase3-operational-ux-audit.md`) and re-confirmed here. The verdict has not changed:

* The **canonical accounting backend** (journal entries, period locks, reconciliation, anomaly detection) is production-ready, append-only, and locked in by 204 financial guards.
* The **frontend accounting UX** has friction in five places (listed below) but each fix carries non-trivial design + operator-training cost.
* This phase does **NOT** ship a canonical-data change. Instead it locks in the V23 design spec so the rebuild is implementable in one focused pass.

The full operational rebuild (journal panels, audit trail, period-lock awareness, anomaly visibility, sticky reconciliation actions) remains a frozen V23 spec because:

1. Any change to the journal-display layer touches surfaces that the V21 Phase 1 lock-in tests guard. Those tests pass today; we will not silently break the implicit guard contract.
2. Period-lock awareness UX needs server-side enrichment (a flat `period.lock.status` projection that does not exist yet — only the enforce flag does).
3. The anomaly visibility surface needs the V21 Phase 4 observability snapshot (already built) wired into the accounting workspace, but the workspace itself needs a layout decision first.

---

## 2. Audit findings (re-confirmed in V22 Phase 5)

### 2.1 Reconciliation workspace

* **Current:** Reconciliation runs are visible in `<ReconciliationStatus>` cards but each card is a self-contained mini-summary. There is no "workspace" that lets an operator: pick a date range → see all anomalies → drill to the journal entry → trigger a manual reconciliation re-run.
* **V21 Phase 4 dependency met?** Yes — `RealtimeMetricsService` + the 5 built-in alert rules already expose every signal needed.
* **V23 spec:**
  * New route `/accounting/reconciliation` (additive).
  * Three-column layout: filter rail / drift list (virtualized) / detail pane.
  * Detail pane = `<JournalEntryCard>` + drift breakdown + manual re-run button (calls `/api/accounting/reconciliation/run` — already exists).
  * Realtime: `useRealtimeFinancialFeed({ channel: 'reconciliation' })`.

### 2.2 Journal visibility panels

* **Current:** Journal entries are accessible via `/customer-statement-journal` (single-customer view). There is no system-wide journal explorer.
* **Risk:** None — explorer would be read-only over the existing `JournalEntry` projection.
* **V23 spec:**
  * Read-only paginated explorer over `GET /api/journal/entries` (already exists per V21 Phase 1 audit).
  * Filter by date, account, branch, sourceRef.
  * Reuses `<JournalEntryCard>`.
  * Hard rule: never expose a "delete" or "edit" action — append-only + reversal-only is the only legal correction path.

### 2.3 Audit trail visibility

* **Current:** Audit trail lives behind `/audit-logs` (gated by `VIEW_AUDIT_LOGS`). Already linked from the security panel.
* **Verdict:** No change needed. CC operators do not have `VIEW_AUDIT_LOGS`; this is by design.

### 2.4 Period-lock awareness

* **Current:** `PERIOD_LOCK_ENFORCE` is documented in `.env.example` but the UI gives no signal that a period is closed. Operators learn about a closed period only when a write fails.
* **Backend dependency:** A `GET /api/accounting/periods/health` projection that returns `{ periods: [{ id, status: 'OPEN'|'CLOSED', closedAt, lockedBy }] }`. This projection does not exist yet — `projectPeriodHealth` is a backend service but is not exposed.
* **V23 spec:**
  * Expose the projection (additive endpoint, read-only).
  * Add a `<PeriodLockChip>` primitive in the accounting workspace header.
  * Add the period status to the toast emitted on every successful canonical write so operators get realtime lock-status feedback.

### 2.5 Anomaly visibility

* **Current:** Anomaly detectors (`detectDuplicateSourceRefs`, `detectOrphanWalletEvents`, `detectStaleSnapshots`, `detectDuplicateSettlements`, `detectReplayAnomaly`) run server-side but their results are not surfaced in the UI.
* **Backend dependency met?** Yes — `RealtimeMetricsService.evaluateAlerts` already evaluates them and the 5 built-in alert rules cover them.
* **V23 spec:**
  * Add a top-level "Anomalies" tab in the accounting workspace, consuming `/api/realtime/metrics/snapshot`.
  * Realtime: `useRealtimeFinancialFeed({ channel: 'reconciliation' })` triggers a snapshot refetch on every event.
  * Each anomaly row is a `<SmartActionChip tone="critical">` with a "View detail" link.

### 2.6 Operational filters

* **Current:** Existing filters on the reconciliation report are multi-page form controls.
* **V23 spec:** Replace with a single `<CommandPalette>` integration (`Ctrl/Cmd+K → "Filter by branch …"`). Reuses the V21 Phase 3 global palette.

### 2.7 Financial timeline continuity

* **Current:** `<FinancialTimeline>` is rendered in Customer360 but not in the accounting workspace.
* **V23 spec:** Embed the same primitive in the reconciliation detail pane, scoped to the customer involved in the drift.

### 2.8 Sticky reconciliation actions

* **V23 spec:** Reuse the new `<StickyActionBar>` primitive shipped in this phase (`Alt+R` re-run, `Alt+E` escalate, `Alt+A` acknowledge anomaly, `Alt+J` jump to journal).

---

## 3. What this phase shipped against accounting (zero-impact)

The V22 Phase 5 surfaces wired with realtime SSE all rely on the same canonical projections that the accounting workspace consumes. So when an accountant runs a reconciliation:

1. The backend emits a `finance.reconciliation.failed` event into the canonical event bus (V21 Phase 4).
2. The Customer360 v2 page (subscribed to channel `customer360`) sees the corresponding `finance.snapshot.refreshed` event (the snapshot reader fans out to multiple channels) and triggers a canonical refetch.
3. The CC dashboard (subscribed to channel `dashboards`) refetches the outstanding/operations summary.
4. The collections page (subscribed to channel `collections`) refetches the queue.

Net effect: every CC surface is now live with respect to backend accounting actions, **without** any frontend code in `web/src/modules/accounting/*` being touched. This is the V22 spec for "every UX improvement MUST preserve exact business behavior" being honored at the architectural level.

---

## 4. Validation

Same gates as Customer360 (the accounting code path was not touched, so the regression risk is structural, not behavioral):

| Gate | Result |
| --- | --- |
| Backend Jest (financial guards + event bus subset) | ✅ 204/204 |
| Frontend Vitest | 182/182 |
| Production builds | ✅ both clean |

---

## 5. Files touched

### Added
* `docs/v22-phase5-accounting-ux-report.md` (this file).

### Modified / Deleted
* None.

---

## 6. V23 entry conditions

The V23 accounting workspace rebuild is unblocked when:

1. The `/api/accounting/periods/health` projection ships (backend, read-only, additive).
2. The CC team has signed off on the reconciliation workspace mockup.
3. The new `<PeriodLockChip>` primitive design is approved.
4. A measurable `OBS-V22-2` adoption metric is set up (similar to the Customer360 v2 metric described in the rebuild report).
