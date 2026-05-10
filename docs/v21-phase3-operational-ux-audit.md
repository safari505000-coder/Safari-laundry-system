# V21 — PHASE 3 — OPERATIONAL UX FORENSIC AUDIT

> Read-only audit of the 9 named operational workflows. Every
> finding cites concrete files. Recommendations are sized into
> three brackets: **WIRE_NOW** (built infrastructure, never
> wired — adopt in this phase), **DESIGN_AND_BUILD_V22** (needs
> design iteration), and **OBSERVED_HEALTHY** (no action).

---

## 0 — Headline finding

The frontend has **two layers of latent infrastructure** that
were built proactively in V20.9 Phase 4 and **never wired into
the running app**. Adopting them costs almost nothing and
unlocks 80% of the keyboard-first / workflow-first goals of
this phase:

| Latent infrastructure | Built in | Wired? | Effort to wire | Impact |
|-----------------------|---------|--------|----------------|--------|
| `CommandPalette` (Ctrl/Cmd+K, fuzzy nav, accessibility) | V20.9 P4 | **NO** (only in tests) | 1 wrapper component + 1 mount | **HIGH** — every operator gains keyboard navigation |
| `useGlobalShortcut` (modifier-aware, input-safe) | V20.9 P4 | NO outside palette test | n/a (consumed by palette wrapper) | **HIGH** |

Phase 3 wires both. See `v21-phase3-implementation.md`.

---

## 1 — Workflow-by-workflow audit

### 1.1 POS (`web/src/pages/pos-route.tsx`, `modules/driver/pages/DriverPOS.tsx`, `modules/shared/hooks/use-pos-engine.ts`)

| Aspect | Finding |
|--------|---------|
| **Click-depth to ring up** | 3-4 (item search → quantity → payment method → confirm) |
| **Operator-side calculations** | `use-pos-engine.ts` does intentional client-side math for change calculation (operator UX requirement; documented in V21 Phase 1 audit as exception) |
| **Keyboard support** | Item search input is auto-focused; payment-method confirmation needs Enter; **no global Ctrl+K shortcut to navigate to POS** |
| **Friction points** | Switching between POS and Customer360 requires a route change; sticky action bar absent on tablet; mobile flow exists but lacks haptic confirmation |
| **Recommendation** | **WIRE_NOW** — add POS as a top-level command in the command palette so operators can `Ctrl+K → "pos"` from anywhere. **DESIGN_AND_BUILD_V22** — sticky action bar on tablet; haptic confirmations |

### 1.2 Customer360 (`modules/customers/components/Customer360Smart.tsx`, `modules/call-center/dashboard/pages/cc-customer-360-page.tsx`)

| Aspect | Finding |
|--------|---------|
| **Surface count** | 2 (the legacy `Customer360Smart` + the modern CC `cc-customer-360-page`); the CC page is the more complete surface; the smart variant is a compact stat block |
| **Navigation depth** | Reach via search → click; no quick-jump; no recent customers |
| **Visual hierarchy** | The smart variant (101 lines) is read-only, single-column, no quick-action sidebar; the CC page has tabs (overview, dispatch, risk) with multiple panels |
| **Duplicated rendering** | Header information (name, rating, debt total) is rendered in 3 places: `customer-360-header`, `kpi-strip`, `Customer360Smart`. Each consumes the same `Customer360Data` payload but renders independently |
| **Quick actions** | Call / WhatsApp present; settle / new-invoice / new-promise NOT inline (require route change) |
| **Recommendation** | **DESIGN_AND_BUILD_V22** — full Customer360 rebuild as a 3-pane operational command center. **WIRE_NOW** — add "Jump to customer" command (`Ctrl+K → cust <id-or-phone>`) for instant navigation |

### 1.3 Collections (`modules/collections/pages/CollectionsWorkspaceShell.tsx`, `…/CollectionsOperationsWorkspace.tsx`)

| Aspect | Finding |
|--------|---------|
| **Architecture** | Already a 3-pane workspace (Hero + Queue + Timeline + Assistant + ActionBar + KpiStrip + QuickActions) — V20.9 Phase 4 redesign |
| **Keyboard** | Workspace-scoped Alt-letter shortcuts via `use-collector-shortcuts` (separate from the global hook) |
| **Friction points** | Switching from Collections workspace to Customer360 requires a route change |
| **Recommendation** | **OBSERVED_HEALTHY** — Collections is the reference workflow design for the rest of the app. **WIRE_NOW** — add "Open Collections" to global palette |

### 1.4 Call Center (`modules/call-center/dashboard/pages/cc-dashboard-page.tsx`)

| Aspect | Finding |
|--------|---------|
| **Architecture** | Multi-panel dashboard: KPI strip + customer search + customer panel (with overview / dispatch / risk tabs) + alerts panel + dispatch monitor + activity feed |
| **Click-depth to dispatch** | Search → customer → dispatch tab → "create dispatch" button → modal → confirm. **5 clicks**. Could be 2 with a sticky action. |
| **Real-time** | `dispatch-monitor-panel` polls; **no realtime SSE wire-up** despite `SafariStreamProvider` being in the app |
| **Recommendation** | **WIRE_NOW** — quick "create dispatch" command in palette (skips 3 clicks). **DESIGN_AND_BUILD_V22** — wire dispatch monitor to SafariStream for live updates |

### 1.5 Accounting (`pages/accountant-dashboard-page.tsx`, `modules/accountant/pages/KnetAudit.tsx`, `…/StockIn.tsx`, `…/InventoryReport.tsx`)

| Aspect | Finding |
|--------|---------|
| **Surface count** | Dashboard + 3 dedicated pages |
| **KNET audit flow** | Manual entry per row + tolerance comparison `Math.abs(manualVal - amount) < 0.002` (intentional reconciliation tolerance). **Operator-friction**: no bulk-paste, no CSV import |
| **Stock-in** | Form-based; reasonable depth |
| **Recommendation** | **DESIGN_AND_BUILD_V22** — KNET audit bulk-paste; CSV import |

### 1.6 Debt Tracking (`pages/debt-holds-page.tsx`, `pages/debt-recovery-report-page.tsx`, `pages/debt-transfers-page.tsx`)

| Aspect | Finding |
|--------|---------|
| **Surface count** | 3 separate pages (holds / recovery / transfers) |
| **Cross-page navigation** | Top-nav links only; no inter-page workflow |
| **Recommendation** | **DESIGN_AND_BUILD_V22** — unify into a "Debt Operations" workspace shell similar to Collections |

### 1.7 Subscription Operations (`pages/subscribers-page.tsx`, `pages/subscriptions-page.tsx`)

| Aspect | Finding |
|--------|---------|
| **Surface count** | 2 pages (subscribers list + per-subscription detail) |
| **Activation flow** | Form-driven with input parsing (`parseFloat` on `salePrice`, line 188); documented in V21 Phase 1 audit as form-input parsing, not money math |
| **Recommendation** | **OBSERVED_HEALTHY** — adequate for current scale |

### 1.8 Reconciliation (`pages/cash-reconciliation-page.tsx`, `pages/driver-cash-trace-page.tsx`)

| Aspect | Finding |
|--------|---------|
| **Surface count** | 2 pages |
| **Operator workflow** | Reconcile by date range; drill into driver discrepancies |
| **Recommendation** | **OBSERVED_HEALTHY** — re-evaluate after Customer360 rebuild |

### 1.9 Financial Reporting (`pages/reports-page.tsx`, `pages/financial-reports-hub-page.tsx`, `pages/operational-reports-hub-page.tsx`, `pages/finance-ledger-reports-page.tsx`, etc.)

| Aspect | Finding |
|--------|---------|
| **Surface count** | 6+ report pages, organized into 2 hub pages (financial / operational) |
| **Hub pattern** | Already in place — operators navigate hub → individual report |
| **Recommendation** | **WIRE_NOW** — surface the 2 hub pages in the global palette so `Ctrl+K → "report"` jumps directly |

---

## 2 — Cross-cutting friction points

| # | Friction | Severity | Phase 3 action |
|---|----------|---------:|----------------|
| 1 | No global keyboard shortcut layer despite built+tested infrastructure | **HIGH** | WIRE_NOW |
| 2 | Customer360 rendered in 3 places (header / KPI / smart-block) with no canonical surface | MEDIUM | V22 |
| 3 | Several screens require 4-5 clicks for routine actions | MEDIUM | V22 (sticky action bar pattern) |
| 4 | No fuzzy customer-id-or-phone jump | HIGH | WIRE_NOW (palette command) |
| 5 | Real-time wire-up incomplete (CC dispatch panel, etc.) | MEDIUM | V22 |
| 6 | Mobile workflows present but lack ergonomics polish (gesture, sheet, haptic) | LOW | V22 |
| 7 | Onboarding tour infrastructure deleted in V21 Phase 2 (was orphan) — needs re-design before re-build | LOW | V22 (design first) |
| 8 | Lazy-route helper deleted in V21 Phase 2 (was orphan) — code-splitting still ungained | LOW | V22 (perf-driven re-build) |

---

## 3 — Existing UX strengths (preserve)

| Strength | Lock-in mechanism |
|----------|-------------------|
| Single canonical KWD formatter (`web/src/lib/kwd.ts`, 11 helpers) | V21 Phase 1 + Phase 2 guards |
| 14 financial pages in `moneyComparisonGuardedFiles` (no `parseFloat` on KD) | V21 Phase 1 guard |
| Single design-system primitive per class (badge / KPI / table / etc.) | V20.7-V20.8 design-system tests |
| Single fetch channel + cross-module-import boundary | V20.8 + V21 Phase 1 guards |
| Workspace-pattern Collections workflow (3-pane + Alt-letter shortcuts) | Reference design for V22 |
| Dismissible role-based guidance banner | `executive-shell.tsx` |
| Operator-route-hint surface | `OperatorRouteHint` |
| RTL-aware Toaster + role-aware sidebar | Already wired |

---

## 4 — Audit verdict

The Safari ERP frontend has **excellent design-system bones** and
**3 of 9 workflows already at workspace-grade** (Collections,
Customer360 CC variant, Reports hubs). The single biggest UX
debt is **unwired keyboard infrastructure**: an operator-grade
command palette + global shortcut hook were built, tested, and
then never plugged into the running app.

Phase 3 closes that gap (objective WIRE_NOW), documents the
Customer360 rebuild + Debt Operations workspace as V22 design
specs (objective DESIGN_AND_BUILD_V22), and locks the wiring
in via build-fail guards.

See `docs/v21-phase3-implementation.md` for the wave log,
`docs/v21-phase3-customer360-rebuild-spec.md` for the V22
Customer360 spec, `docs/v21-phase3-workflow-redesign-report.md`
for the per-workflow recommended redesigns,
`docs/v21-phase3-responsive-validation.md` /
`docs/v21-phase3-accessibility-report.md` /
`docs/v21-phase3-performance-validation.md` for the validation
sub-reports, and `docs/v21-phase3-ux-scorecard.md` for the
final scorecard + rollback guide.
