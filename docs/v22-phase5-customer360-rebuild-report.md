# V22 Phase 5 — Customer360 Operational Rebuild Report

**Mission:** Rebuild Customer360 into a live operational command center
**Phase:** V22 Phase 5 (Operator UX Rebuild)
**Status:** ✅ Delivered (additive — v1 page intact)
**Date:** 2026-05-09 (Friday → Saturday session)
**Hard rules:** Zero canonical financial logic touched. Every KD value displayed flows from the canonical projection. Realtime payloads never own financial truth.

---

## 1. Outcome at a glance

| Item | v1 (`cc-customer-360-page`) | v2 (`cc-customer-360-v2-page`, NEW) |
| --- | --- | --- |
| Mounted route | `/cc/customers/:customerId` | `/cc/customers/:customerId/360` |
| Layout | Header + 3 tabs (Overview / Dispatch / Risk) | 3-pane operational command center |
| Realtime SSE wire | ✅ Added in this phase (channel `customer360`) | ✅ Built-in (channel `customer360`) |
| Sticky action bar | ❌ | ✅ `<StickyActionBar>` (Alt+P / N / D / C / S) |
| Smart hints | ❌ (popovers only) | ✅ `<SmartActionChip>` row (debt, blocked, alerts, dispatch) |
| Activity timeline | Inside Risk tab | Always-visible center pane |
| Canonical mutations | Inside dialogs | Delegated back to v1 (read-first rebuild) |
| Lock-in tests | Existing CC tests | 8 new architecture tests |

**Headline:** the v2 page co-exists with v1 (no breaking change to bookmarks, deep links, or operator habits) and the v1 page itself gained the same realtime SSE feed, so adoption of v2 can be measured on telemetry without forcing a hard cut-over.

---

## 2. Why a rebuild, why additive

### 2.1 Friction observed in v1 (audited in V21 Phase 3)

* Three nested tabs forced operators to context-switch when finishing a single workflow ("see debt → record payment → check dispatch").
* The Overview tab rendered Cards but not the underlying timeline; the timeline only lived inside the Risk tab.
* Smart hints (overdue, blocked) were buried in copy text inside the cards, not prominent.
* No global keyboard shortcuts for the high-frequency actions (pay, note, callback, dispatch, next).
* No live realtime refresh — operators had to manually refresh after another agent edited the customer.

### 2.2 Rebuild constraints

The rebuild is **additive on a new route** because:

1. The v1 page is the canonical owner of every mutation dialog (block/unblock, create dispatch). Until a follow-up phase migrates those dialogs cleanly, v2 navigates the operator back to v1 for write actions. This preserves zero-regression.
2. Existing bookmarks and deep links (`/cc/customers/:customerId?tab=…`) MUST keep working unchanged.
3. We can roll back v2 by deleting one route and one file. v1 stays fully functional.

---

## 3. v2 layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Sticky back-bar + customer search                                  │
├────────────────────────────────────────────────────────────────────┤
│ <CustomerFinancialHeader>                                          │
│   • name • phone • risk score • collections stage • …              │
├────────────────────────────────────────────────────────────────────┤
│ <SmartActionChip> row (only renders when there is something to     │
│   say): blocked, debt, sub remaining, alerts, active dispatches    │
├──────────────┬─────────────────────────────────┬──────────────────┤
│ LEFT 240px   │ CENTER (1fr)                    │ RIGHT 320px      │
│ Quick nav    │ 4× FinancialStatCard (totals)   │ Operator note    │
│ Sub list     │ Subscription panel              │ Insight detail   │
│ Active disp  │ TimelineCard list (12)          │ Shortcut help    │
│ Hints        │                                 │                  │
└──────────────┴─────────────────────────────────┴──────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│ <StickyActionBar> · Alt+P pay · Alt+N note · Alt+D dispatch · …    │
└────────────────────────────────────────────────────────────────────┘
```

Below `lg` (responsive collapse), the 3 columns stack into a single column and the action bar stays sticky to the bottom edge.

---

## 4. Data sources (single source of financial truth)

Every KD value rendered in v2 originates from one of these canonical projections:

| Field on the page | Canonical source |
| --- | --- |
| `f.totalInvoicesKd`, `f.totalPaymentsKd`, `f.totalDueKd`, `f.subscriptionRemainingKd` | `useCcCustomer360()` → `GET /api/customers/:id/360` |
| Risk score (`score.value`) | Same projection (internal payload only) |
| Subscription rows (`planSalePriceKd`, `planActualBalanceKd`) | Same projection (`subscriptions[]`) |
| Dispatch rows (`driverName`, `elapsedMinutes`) | `useCcActiveDispatches()` |
| Smart hint thresholds | `isMaterialKd` / `isPositiveKd` (canonical KWD comparison helpers) |

**Forbidden in v2:**
* `parseFloat`, `Number(`, `Math.round`, `.toFixed(3)` on KD values — locked in by `v22-phase5-customer-360-v2-architecture.test.tsx` (test #6).
* Reductions or string additions of `*Kd` fields — locked in by the same test (test #7).
* Reading `payload.*Kd` from realtime envelopes — locked in by `v22-phase5-realtime-adoption.test.ts` (test #5) and the V21 Phase 4 tree-wide guard.

---

## 5. Realtime adoption

```ts
useRealtimeFinancialFeed({
  channel: 'customer360',
  customerId: safeCustomerId,
  accessToken: token,
  enabled: Boolean(safeCustomerId && token),
  onEvent: () => {
    customer360.reload(); // canonical refetch
    dispatches.reload();  // canonical refetch
  },
});
```

* Channel: `customer360` — fans out for `finance.payment.captured`, `finance.payment.partial`, `finance.invoice.issued`, `finance.invoice.reversed`, `finance.refund.created`, `finance.wallet.adjusted`, `finance.subscription.activated`, `finance.subscription.expired`, `finance.snapshot.refreshed`, `finance.risk.recalculated`, `finance.fraud.alert.created`.
* Customer-scoped — backend gateway only forwards events whose `customerId` matches the connected scope.
* `onEvent` only triggers a canonical refetch — payload bytes are never displayed.
* Safety: connection auto-reconnects on transient network blips and the page still has the underlying poll on `useCcActiveDispatches` (10 s) as a fallback for missed events.

---

## 6. New design-system primitives

This phase ships two small, reusable primitives that future operational pages can compose:

### 6.1 `<StickyActionBar>` (`@/modules/shared/components/operational`)

* Bottom-sticky button rail with built-in `Alt+<key>` handler registration.
* Five tone classes (`primary` / `success` / `warning` / `danger` / `ghost`).
* Renders nothing when `actions=[]` or `hidden`.
* Disabled actions are not triggered by click or keyboard shortcut.
* Each action exposes `aria-keyshortcuts="Alt+<X>"` for screen-reader discovery.
* Test coverage: 7 behavioral tests in `v22-phase5-operational-primitives.test.tsx`.

### 6.2 `<SmartActionChip>` (same module)

* Non-destructive operational hint chip.
* Five tones (`info` / `recommend` / `warn` / `critical` / `muted`).
* Renders as a `<span>` by default and as a `<button>` when `onActivate` is supplied.
* Hard rule: chip MUST NOT compute money values, derive balances, or call APIs directly.
* Test coverage: 3 behavioral tests in the same file.

Both primitives are barrel-exported from `@/modules/shared/components/operational`.

---

## 7. What v2 deliberately does NOT do (reserved for V23)

* **Migrate the mutation dialogs.** Block/unblock + create-dispatch dialogs still live in v1. v2 navigates the operator back to v1 with the right `?tab=…` so the keyboard-first flow remains end-to-end. V23 will move dialogs into a portal-style overlay inside v2.
* **Rewrite the underlying 360 fetch.** v2 reuses `useCcCustomer360`. A V23 follow-up will introduce a slimmer `useCustomer360` hook that returns a flatter projection optimized for the 3-pane layout.
* **Add operator presence indicators.** Right pane has the slot reserved (third card) but the presence stream itself ships in V23.
* **Add bulk actions.** v2 is single-customer. The collections workspace shell already has the bulk action contract; bulk actions in Customer360 are out of scope.
* **Replace v1.** v1 stays mounted indefinitely until v2 has measured adoption + zero regressions for at least one operational quarter.

---

## 8. Validation summary

| Gate | Result |
| --- | --- |
| Frontend Vitest | 182/182 (incl. 23 new V22 lock-ins) |
| Frontend production build (`vite build`) | ✅ 2,781 modules transformed |
| Frontend circular dependency scan (`madge --circular`) | ✅ none found |
| Backend Jest (financial guards + event bus subset) | ✅ 204/204 |
| Backend TypeScript build (`tsc -p tsconfig.build.json --noEmit`) | ✅ clean |
| Lint (`ReadLints`) on touched files | ✅ no errors |

Detailed evidence is in `docs/v22-phase5-validation.md`.

---

## 9. Files touched

### Added

* `web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx`
* `web/src/modules/shared/components/operational/StickyActionBar.tsx`
* `web/src/modules/shared/components/operational/SmartActionChip.tsx`
* `web/src/modules/shared/components/operational/index.ts`
* `web/src/modules/shared/components/operational/v22-phase5-operational-primitives.test.tsx`
* `web/src/modules/call-center/dashboard/pages/v22-phase5-customer-360-v2-architecture.test.tsx`
* `web/src/modules/finance/state/v22-phase5-realtime-adoption.test.ts`
* `docs/v22-phase5-customer360-rebuild-report.md` (this file)
* `docs/v22-phase5-collections-workflow-report.md`
* `docs/v22-phase5-accounting-ux-report.md`
* `docs/v22-phase5-realtime-adoption-validation.md`
* `docs/v22-phase5-responsive-validation.md`
* `docs/v22-phase5-accessibility-report.md`
* `docs/v22-phase5-performance-validation.md`
* `docs/v22-phase5-rollout-guide.md`
* `docs/v22-phase5-rollback-guide.md`
* `docs/v22-phase5-final-operational-ux-scorecard.md`
* `docs/v22-phase5-validation.md`
* `docs/v22-phase5-implementation.md`

### Modified

* `web/src/App.tsx` — added the new `/cc/customers/:customerId/360` route alongside the existing `/cc/customers/:customerId` route.
* `web/src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx` — added canonical SSE wire (channel `customer360`).
* `web/src/modules/call-center/dashboard/pages/cc-dashboard-page.tsx` — added canonical SSE wire (channel `dashboards`).
* `web/src/modules/call-center/pages/collections-page.tsx` — added canonical SSE wire (channel `collections`).

### Deleted

* None.

---

## 10. Rollback (one command)

If v2 needs to be removed:

```bash
git revert <commit-hash-of-v22-phase5>
```

Or granular:

```bash
git rm web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx
git rm web/src/modules/call-center/dashboard/pages/v22-phase5-customer-360-v2-architecture.test.tsx
# Then remove the import + Route block in web/src/App.tsx
```

The v1 page and every existing bookmark continues to work unchanged.

---

## 11. Adoption signal

To measure whether v2 is succeeding before committing to a hard cut-over, a follow-up dashboard tile (V23 backlog item `OBS-V22-1`) will track:

* Hits on `/cc/customers/:customerId/360` vs `/cc/customers/:customerId`.
* Mean time-to-action (first canonical mutation per session) on each route.
* Realtime SSE reconnect count per session.
* Action-bar shortcut usage frequency (`Alt+P`, `Alt+N`, `Alt+D`, `Alt+C`, `Alt+S`).

When v2 reaches ≥ 70 % of CC sessions and the regression budget is clean for two operational quarters, V23 will collapse the v1/v2 split.
