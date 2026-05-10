# V21 Phase 3 — Customer360 Rebuild Specification (V22 implementation target)

> Phase 3 deliverable: full design specification for the
> Customer360 rebuild. Implementation deferred to V22 because
> a sound rebuild requires design iteration with operators
> and is a significantly larger surface than a single
> additive PR can responsibly cover.
>
> This spec is **frozen** at the end of Phase 3 — it is the
> contract V22 implementation must satisfy. Any deviation
> requires explicit sign-off and a new rev of this document.

---

## 1 — Problem statement

Today the Customer360 surface is fragmented across three
renderings of the same underlying `Customer360Data` payload:

| Surface | File | Role |
|---------|------|------|
| Compact stat block | `web/src/modules/customers/components/Customer360Smart.tsx` | Embedded read-only summary |
| CC-side full page | `web/src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx` | Tabbed dashboard for the call center |
| Header strip | `web/src/modules/call-center/dashboard/components/customer-360-header.tsx` | Persistent customer identity |

The same money fields (debt total / wallet balance / subscription
remaining) are formatted independently in each surface. The CC
page has overview / dispatch / risk tabs but no inline action
continuation — completing one task always returns the operator
to the customer panel rather than advancing the workflow.

---

## 2 — Target experience

A **single Customer360 command center** with three persistent
panes:

```
┌─────────────────────────────────────────────────────────────┐
│  CUSTOMER IDENTITY HERO  (sticky, non-scrolling)            │
│  • name · phone · branch · rating chip · since-date         │
│  • Quick-action buttons row: call · WhatsApp · settle ·     │
│    new invoice · new promise · open dispatch                │
├──────────────────┬───────────────────────┬──────────────────┤
│  FINANCIAL STATE │  TIMELINE             │  CONTEXT PANE    │
│  (left, fixed)   │  (center, scrollable) │  (right, fixed)  │
│                  │                       │                  │
│  • Debt total    │  • Unified event      │  • Notes         │
│  • Wallet bal.   │    stream: invoices,  │  • Smart actions │
│  • Subscription  │    payments, promises,│    queue         │
│    state         │    settlements,       │  • Linked driver │
│  • Aging buckets │    dispatches, calls  │  • Linked branch │
│  • Health score  │  • Pinned notes top   │                  │
│                  │  • Filter toolbar     │                  │
└──────────────────┴───────────────────────┴──────────────────┘
```

### 2.1 Identity hero (sticky)

  * Renders **only** identity + rating, never recomputed from
    line items. The rating chip MUST come from the canonical
    `customer.financialHealth` projection — no UI-side
    classification.
  * Quick-action row uses the new **inline action pattern** —
    each action either:
    * Opens an inline form panel below the hero (settle, new
      promise, new note), OR
    * Routes to a workflow that returns to this same Customer360
      with state preserved (new invoice, open dispatch).

### 2.2 Financial state pane (left, fixed-width)

  * One `<KpiCard>` per row, in canonical order:
    1. **Debt total** — `formatKwdLabel(financials.totalDueKd)`
    2. **Wallet balance** — `formatKwdLabel(financials.walletBalanceKd)`
    3. **Subscription remaining** — `formatKwdLabel(subscription.subscriptionRemainingKd)`
    4. **Last payment** — date + `formatKwdLabel(...)`
  * Aging strip uses canonical `customer.aging` projection (server-derived).
  * Health score displays the canonical `customer.financialHealth.score`
    with the canonical `customer.financialHealth.classification` chip.
  * **No client-side aggregation**. If a number isn't in the
    canonical projection, it doesn't render here.

### 2.3 Timeline pane (center, scrollable)

  * Single unified event stream from
    `Customer360Data.timeline` — already the canonical
    server-derived projection.
  * Visual treatment: one `<TimelineCard>` primitive
    (V20.7 design system) per event. **No per-event-type
    custom cards** — the polymorphism is in `event.kind`,
    rendered through one `<TimelineCard kind={...} />`.
  * Filter toolbar (chips): All · Invoices · Payments ·
    Promises · Settlements · Dispatches · Calls · Notes.
  * Pinned notes float to the top of the stream regardless
    of date.

### 2.4 Context pane (right, fixed-width)

  * **Notes** — collapsible; quick-add inline.
  * **Smart actions queue** — non-destructive recommendations
    (see §3 of `v21-phase3-workflow-redesign-report.md`).
  * **Linked entities** — driver, branch, owner — each a
    deep link.

---

## 3 — Behavioural contract (V22 must satisfy)

| ID | Contract | Validation |
|----|----------|------------|
| C-1 | Hero, financial pane, and timeline all consume the **same** `Customer360Data` object — no parallel fetches | unit test asserts `useCustomer360(id)` is called exactly once per page mount |
| C-2 | Money rendered exclusively via `formatKwdLabel` / `formatKwdAmount` — no `parseFloat` / `Number()` on KD strings | extends `moneyComparisonGuardedFiles` in `v21-canonical-banking-guards.spec.ts` to cover the new files |
| C-3 | Rating + health classification come from server projection only | source-string assertion that the page does not import any client-side classifier |
| C-4 | Quick-action buttons either route OR open an inline panel — never open a fullscreen modal that loses Customer360 context | snapshot test asserts `<Modal fullscreen>` is absent from the page tree |
| C-5 | Keyboard: `j`/`k` navigates timeline events; `Enter` opens; `n` adds a note; `s` opens settle inline | uses `useGlobalShortcut` per-shortcut, locked-in by a behaviour test |
| C-6 | Smart actions are **read-only suggestions** — clicking one routes the operator into the appropriate workflow but never triggers a financial side-effect from the suggestion itself | source-string assertion that `SmartActionsPanel.tsx` does not import `apiJson` for write paths |
| C-7 | The page is the **only** Customer360 surface that ships in V22 — `Customer360Smart.tsx` is migrated to a thin re-export and `cc-customer-360-page.tsx` becomes the canonical implementation | madge verifies single source |

---

## 4 — Files V22 must touch

| File | Action |
|------|--------|
| `web/src/modules/customers/pages/customer-360-page.tsx` | **NEW** — canonical Customer360 page (3-pane shell) |
| `web/src/modules/customers/components/Customer360IdentityHero.tsx` | **NEW** |
| `web/src/modules/customers/components/Customer360FinancialPane.tsx` | **NEW** |
| `web/src/modules/customers/components/Customer360TimelinePane.tsx` | **NEW** |
| `web/src/modules/customers/components/Customer360ContextPane.tsx` | **NEW** |
| `web/src/modules/customers/components/Customer360Smart.tsx` | **MIGRATE** — re-export the new identity + financial panes for legacy embedders |
| `web/src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx` | **REPLACE** — delegate to the canonical page; CC route stays the same |
| `web/src/modules/call-center/dashboard/components/customer-360-header.tsx` | **DELETE** — replaced by `Customer360IdentityHero` |
| `src/finance/v21-canonical-banking-guards.spec.ts` | **UPDATE** — add the 5 new component files to `moneyComparisonGuardedFiles` |
| `web/src/modules/customers/v22-customer360.spec.tsx` | **NEW** — lock-in tests for C-1 … C-7 |

---

## 5 — Out-of-scope for V22 Customer360 rebuild

  * Anything that would require server-side projection changes
    (would land in V23+).
  * New financial fields. The rebuild reads only existing
    canonical projections.
  * Smart-action **autonomous execution** (forbidden by Phase 3
    hard rule § 5).

---

## 6 — Rollback (V22)

  * The rebuild is additive at the route level — `/cc/customers/:id`
    continues to render the same component name, just delegated.
  * Rollback = `git revert` of the V22 implementation PR; the
    Phase 3 spec stays as-is.
