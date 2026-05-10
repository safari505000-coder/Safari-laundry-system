# V21 Phase 3 — Workflow Redesign Report

> Per-workflow operational redesign blueprint. The
> **WIRE_NOW** items in this document are implemented in
> Phase 3 (see `v21-phase3-implementation.md`). The
> **DESIGN_AND_BUILD_V22** items are frozen specs for
> V22 implementation.

---

## 0 — Cross-workflow patterns introduced in Phase 3

### 0.1 Global Command Palette (WIRE_NOW — DONE in Phase 3)

  * **What** — `Ctrl/Cmd + K` opens a fuzzy command palette
    from any authenticated route.
  * **Where wired** — `web/src/modules/shared/components/shell/executive-shell.tsx`
    mounts `<GlobalCommandPalette />` once per shell, so every
    route under `/` (i.e. all authenticated pages) inherits it.
  * **What it does** — navigates to common targets:
    Dashboard, POS, Collections, Call Center, Customers,
    Financial Reports Hub, Operational Reports Hub,
    Financials, Accountant Dashboard, Unpaid Invoices,
    Debt Holds, System Settings, Staff Hub.
  * **What it does NOT do** — zero financial side-effects.
    The wiring guard `v21-phase3-global-palette.test.tsx`
    asserts no `fetch`, no `apiJson`, no canonical money
    helpers, no Prisma in the palette source.
  * **Roles** — commands appear conditionally based on
    `useAuth().hasRole(...)`. Drivers see Dashboard + POS.
    Operators / accountants see the full set.
  * **Default opens** — empty query renders the role-filtered
    default set ranked by the existing V20.9 palette ranker.
  * **Acceptance** — covered by 8 lock-in tests in
    `v21-phase3-global-palette.test.tsx` (wiring + behaviour),
    plus the 7 pre-existing palette unit tests.

### 0.2 Inline action pattern (DESIGN_AND_BUILD_V22 — spec)

  * **What** — quick-action buttons either:
    1. Open an inline form panel below the originating row
       (settle, new note, mark-as-promise), OR
    2. Route to a workflow that returns to the originating
       page with state preserved (new invoice, open dispatch).
  * **Where it goes** — Customer360 quick-action row,
    Collections queue rows, CC dispatch monitor rows.
  * **What it replaces** — full-page modals that lose
    operator context.

### 0.3 Sticky action bar primitive (DESIGN_AND_BUILD_V22 — spec)

  * **What** — a `<StickyActionBar>` design-system primitive
    that pins the highest-priority action to the bottom of
    the viewport at sub-tablet widths and to the right edge
    at tablet+ widths.
  * **Where it goes** — POS, Collections workspace, CC
    customer panel.
  * **What it replaces** — scroll-out-of-sight buttons.

### 0.4 Workflow continuation hints (DESIGN_AND_BUILD_V22 — spec)

  * **What** — non-destructive "what's next" inline cards.
    After a settlement, surface "open Customer360 → notes
    pane to log the conversation" rather than a dead-end.
  * Source — the canonical projections already expose enough
    to drive these (e.g. last-payment date, open dispatches);
    the hint surface just renders them.

---

## 1 — POS

| Item | Bracket | Implementation |
|------|---------|----------------|
| Add POS as a global palette command | WIRE_NOW | DONE |
| Sticky payment-confirm bar at tablet width | DESIGN_AND_BUILD_V22 | spec § 0.3 |
| Haptic feedback on mobile | DESIGN_AND_BUILD_V22 | needs design iteration |

### Audit notes (from `v21-phase3-operational-ux-audit.md` § 1.1)

  * Item search input is auto-focused — preserve.
  * Change-calculation `parseFloat` is intentional client
    math (operator UX, not money math). Documented exception
    in V21 Phase 1 audit. Preserve.

---

## 2 — Customer360

| Item | Bracket | Implementation |
|------|---------|----------------|
| 3-pane operational command center | DESIGN_AND_BUILD_V22 | full spec in `v21-phase3-customer360-rebuild-spec.md` |
| Add jump-to-customer in palette | WIRE_NOW (partial) | "Open Customers" added; per-customer fuzzy is V22 |
| Inline action quick-row | DESIGN_AND_BUILD_V22 | spec § 0.2 |
| Single canonical money rendering across all 3 surfaces | DESIGN_AND_BUILD_V22 | spec C-2 |

---

## 3 — Collections

| Item | Bracket | Implementation |
|------|---------|----------------|
| Workspace shell already in place (V20.9) | OBSERVED_HEALTHY | preserve |
| Add Collections as a global palette command | WIRE_NOW | DONE |
| Workspace-scoped Alt-letter shortcuts already in place (V20.9 `use-collector-shortcuts`) | OBSERVED_HEALTHY | preserve — different from `useGlobalShortcut` (workspace vs global), both kept |

---

## 4 — Call Center

| Item | Bracket | Implementation |
|------|---------|----------------|
| Add CC dashboard to global palette | WIRE_NOW | DONE |
| "Create dispatch" as a palette command | DESIGN_AND_BUILD_V22 | needs context (which customer?) — spec § 0.2 inline action |
| Wire dispatch monitor to SafariStream for live updates | DESIGN_AND_BUILD_V22 | requires backend SSE channel definition |

---

## 5 — Accounting

| Item | Bracket | Implementation |
|------|---------|----------------|
| Add Accountant Dashboard to global palette | WIRE_NOW | DONE |
| KNET audit bulk paste / CSV | DESIGN_AND_BUILD_V22 | spec needed; out of Phase 3 scope |

---

## 6 — Debt Tracking

| Item | Bracket | Implementation |
|------|---------|----------------|
| Add Debt Holds + Unpaid Invoices to palette | WIRE_NOW | DONE |
| Unify holds / recovery / transfers into a "Debt Operations" workspace shell | DESIGN_AND_BUILD_V22 | spec § 0.1 sibling — needs full design pass |

---

## 7 — Subscription Operations

| Item | Bracket | Implementation |
|------|---------|----------------|
| Already healthy | OBSERVED_HEALTHY | no change |

---

## 8 — Reconciliation

| Item | Bracket | Implementation |
|------|---------|----------------|
| Already healthy | OBSERVED_HEALTHY | no change |
| Re-evaluate after Customer360 rebuild | DESIGN_AND_BUILD_V22 | will likely benefit from inline workflow continuation |

---

## 9 — Financial Reporting

| Item | Bracket | Implementation |
|------|---------|----------------|
| Add `/reports-hub` to global palette | WIRE_NOW | DONE |
| Add `/operational-reports-hub` to global palette | WIRE_NOW | DONE |
| Cross-report deep links | DESIGN_AND_BUILD_V22 | spec needed |

---

## 10 — Smart action system (objective 5)

> Phase 3 hard rule § 5: "No autonomous financial decisions
> allowed." All smart actions in this section are **purely
> non-destructive surfacing** — they never trigger a write
> on their own; they route the operator into the appropriate
> existing workflow which is already protected by the
> canonical write boundary.

| Action class | Source signal (canonical projection) | UI surface (V22) |
|--------------|---------------------------------------|------------------|
| Follow-up suggestion | `customer.lastInteractionAt` > N days | Customer360 context pane chip |
| Callback reminder | `customer.openPromiseCount > 0 && nextPromiseDueAt < tomorrow` | CC alerts panel chip |
| Reconciliation attention | `dailyCash.discrepancyKd != 0` | Cash reconciliation hero strip |
| Collection escalation | `customer.aging.bucket90PlusKd > 0 && customer.financialHealth.classification === 'WATCH'` | Collections queue row badge |
| Workflow continuation | After successful settle / payment / promise — surface "log a note", "set next callback" | Inline beneath the just-completed action |

The implementation pattern: each smart action is a render
function that takes the relevant canonical projection slice
as a prop and returns either `null` (signal absent) or a
`<SmartActionChip onClick={navigateOrInline}>`. **The chip
itself does no work.**

---

## 11 — Realtime UX layer (objective 6)

`SafariStreamProvider` is already wired into `App.tsx`. Phase 3
documents per-surface improvement targets; implementation lands
in V22 in lockstep with Customer360 rebuild.

| Surface | Current | Target |
|---------|---------|--------|
| Collections queue | client polls | subscribe to `collections.queue.changed` |
| CC dispatch monitor | client polls | subscribe to `dispatch.created` / `dispatch.updated` |
| Customer360 timeline | refresh on tab focus | subscribe to per-customer event stream |
| KPI strip | invalidate on every page mount | subscribe to coarse-grained `metrics.tick` |

Loading-state continuity: every panel that subscribes must
keep its previous payload visible while a refresh is in flight
(no "loading…" flash). Use the existing `useQuery` pattern
with `keepPreviousData: true`.

---

## 12 — Mobile + responsive (objective 7)

| Surface | Current | Target |
|---------|---------|--------|
| Sidebar drawer (V19.15) | OK | preserve |
| Customer360 (V22) | n/a | 3-pane → 1-column on `< md`, hero stays sticky |
| Collections workspace | OK | adaptive table on `< md` |
| POS | OK | sticky payment bar on `< md` |

The deleted `use-responsive-mode.ts` orphan is **not**
reintroduced — V22 will rebuild it driven by an actual
consumer (one of the workspaces above).

---

## 13 — Onboarding + employee guidance (objective 8)

The deleted `OnboardingTour.tsx` orphan is **not**
reintroduced. The existing role-aware shell guidance banner
(`shellGuidanceForRole`) and `OperatorRouteHint` cover the
"explain this page" surface today. V22 will add per-action
hints inline (e.g. "this action will hold the customer's
debt — see help" on the debt-hold form) rather than a
modal tour.

---

## 14 — Accessibility + UI consistency (objective 9)

  * Spacing / typography / hierarchy are already governed
    by the V20.7-V20.8 design system tests; no Phase 3
    regression.
  * Focus states: the global palette's input is auto-focused
    on open (lock-in test 6), Esc returns focus correctly
    (lock-in test 7).
  * Keyboard accessibility: `useGlobalShortcut` is the
    canonical entry — all V22 shortcut additions go through
    it. No bespoke `addEventListener('keydown', ...)` allowed
    (the lock-in test family covers the palette; the V22
    Customer360 spec C-5 will extend it).
  * Loading patterns / empty states: design-system primitives
    `<EmptyState>` / `<LoadingSkeleton>` are the canonical
    surface; V22 Customer360 panes consume them.

---

## 15 — Validation (objective 10)

See `v21-phase3-responsive-validation.md`,
`v21-phase3-accessibility-report.md`,
`v21-phase3-performance-validation.md`, and the consolidated
results in `v21-phase3-ux-scorecard.md`.
