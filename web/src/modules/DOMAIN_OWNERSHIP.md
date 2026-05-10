# `web/src/modules/` — Domain Ownership Charter (V20.8)

> Effective from V20.8 — Phase 2.

This file defines who owns what in the frontend module graph, the
import policy each module must obey, and the route-ownership
boundaries that prevent cross-domain leakage.

## 1. Domain → owner map

| Domain | Folder | Charter |
| --- | --- | --- |
| Finance UI Kit | `modules/finance/` | Server-canonical money primitives, financial cache, observability hooks. SINGLE source of truth for *display* of financial values. |
| Collections | `modules/collections/` | Collections workflow (queue, promises, escalation), the V20.7 Collections Operations Workspace shell + panes. |
| Call Center | `modules/callcenter/` (single word) and `modules/call-center/` (legacy kebab) | The CC operator workspace + queue + dispatch. New work uses `callcenter/`; legacy folder is frozen and migrates opportunistically. |
| Driver | `modules/driver/` | Driver task surface, POS, deposits. |
| Manager | `modules/manager/` | Manager custody, my-documents, driver oversight. |
| Owner | `modules/owner/` | Owner-only pages (dashboard, manage items, inventory). |
| Accountant | `modules/accountant/` | Accountant-only pages (knet audit, inventory report, stock-in). |
| Shared | `modules/shared/` | TRULY cross-cutting concerns: auth, layout shells, navigation, generic UI primitives (`ui/`). NOT a dumping ground. |

> **V24 — Station 2 Step B note**: The V20.6 Phase 6A scaffolding rows (`modules/customer360/`, `modules/subscribers/`, `modules/dashboards/`, `modules/accounting/`, `modules/risk/`, `modules/fraud/`) were planned but never populated — each contained only a README placeholder. They were deleted in V24 Station 2 Step B to keep this charter aligned with on-disk reality. If/when any of these domains earns a dedicated module, the charter will be re-extended; until then their UIs continue to live where they were actually built (cross-cutting in `modules/finance/`, `modules/collections/`, or legacy `pages/`).

## 2. Import policy (build-fail in V20.8 Phase 5)

1. **Barrel-only imports between modules.** Every module exposes
   exactly one public surface: `modules/<x>/index.ts`. Other
   modules MUST import from `@/modules/<x>` — never reach into
   `@/modules/<x>/components/SomeFile`.
2. **No deep relative imports across modules.** A file in
   `modules/finance/` may not write `import … from '../../collections/…'`.
   Either go via the barrel (`@/modules/collections`) or move
   the dependency to `modules/shared/`.
3. **Shared/ is a contract, not a parking lot.** Anything dropped
   into `modules/shared/` must be cross-domain. A finance-specific
   helper in `modules/shared/hooks/finance/…` is a smell — it
   belongs in `modules/finance/`.
4. **Direct API access only inside `modules/<x>/api/`.** Components
   never call `apiJson`/`apiFetch` directly; they call hooks in
   `modules/<x>/hooks/` which call the typed clients in
   `modules/<x>/api/`.
5. **No new code in `web/src/pages/`.** That folder is LEGACY
   (V20.7 Phase 1 finding). New routes mount components from
   `modules/<x>/pages/`. Legacy pages migrate opportunistically.

## 3. Route ownership

Routes live in `web/src/App.tsx`. Each route is owned by exactly
one domain via the imported component:

- `/cc/*` → `modules/call-center/*`
- `/customers/*` (operator-side) → `pages/` (legacy)
- `/my-customer-360` → `pages/customer-portal-360-page.tsx` (CUSTOMER role)
- `/subscribers`, `/subscriptions` → `pages/` (legacy)
- `/finance/*` → `pages/` (legacy) → migrating to `modules/finance/pages/`
- `/manager/*` → `modules/manager/`
- `/driver/*`, `/pos`, `/my-*` → `modules/driver/`
- `/owner-dashboard`, `/owner/*` → `modules/owner/`
- `/accountant-dashboard`, `/accountant/*` → `modules/accountant/`
- `/dashboard`, `/admin/*`, `/users-management`, `/system-settings` → cross-cutting (admin/owner)

### Auth + role guards (verified V20.8 Phase 2)

- Public-by-design: `/login`, `/force-change-password`,
  `/public/*`, `/r/:orderId`, `/payment/{success,failed}`. NEVER
  wrap these in `RequireAuth`.
- Authenticated: every other route lives inside
  `<RequireAuth><AuthLayout/>…</RequireAuth>`.
- Per-route fine-grained: `RequireAccess` (preferred,
  matrix-backed) or `RequireRole` (legacy, only where no matrix
  entry exists yet).
- Role-redirect index: `IndexRoute()` in `App.tsx` sends each
  role to its home (`CUSTOMER → /my-customer-360`,
  `DRIVER → /pos`, `CALL_CENTER → /cc/dashboard`,
  `CALL_CENTER_SUPERVISOR → /cc-performance`, default → `/dashboard`).

### Three customer-360 surfaces are NOT a duplicate

The brief mentions:

> `customer-profile`, `subscribers-profile`, `customer360` — مركز موحد إذا كان آمن.

After audit: the three surfaces in production
(`CustomerPortal360Page`, `CcCustomer360Page`,
`CustomerStatementJournalPage`) serve **three different roles
with three different data scopes**:

| Surface | Role | Scope | Auth gate |
| --- | --- | --- | --- |
| `CustomerPortal360Page` | CUSTOMER | self only | `customer360.self` |
| `CcCustomer360Page` | CALL_CENTER | any customer | `ccDashboard.view` |
| `CustomerStatementJournalPage` | ACCOUNTANT | any customer + journal scope | `journalStatement.view` |

Merging them would cross security boundaries. They stay as three
distinct routes; what gets unified (Phase 3) is the underlying
**components** they use (`CustomerFinancialHeader`,
`OutstandingTable`, `FinancialTimeline` from V20.7 — already a
single source).

## 4. Already-consolidated routes (verified)

Several legacy URLs already redirect to canonical paths:

| Legacy URL | Canonical URL |
| --- | --- |
| `/expense-approval` | `/expenses/approval` |
| `/vehicle-expenses` | `/expenses/cars` |
| `/vehicle-expenses/approval` | `/expenses/cars` |
| `/vehicle-expenses/report` | `/expenses/cars` |
| `/vehicle-expenses/*` | `/expenses/cars` |
| `/cc/outstanding` | (unchanged in `App.tsx`; consolidated UI inside) |

The orphan `vehicle-expenses-{approval,mine,report}-page.tsx`
files in `web/src/pages/` are the OLD components that the
redirects bypass. Phase 6 of V20.8 will delete them.

## 5. Enforcement

- The Phase 5 static guard (extension of V20.7 Phase 7) will
  fail the build on:
  - Direct `apiJson`/`apiFetch` inside `modules/finance/components`,
    `modules/finance/pages`, `modules/collections/components`,
    `modules/collections/pages`.
  - Deep relative imports across modules (e.g.
    `import … from '../../<other-module>/…'`).
  - Client-side KD math (already enforced in V20.7).

## 6. Rollback

This file is documentation only — deleting it does not change
runtime behaviour. The static guard in Phase 5 is a single test
file; deleting that file removes the build-fail. Both are
git-traceable.

---

**Phase 2 status: ✅ COMPLETE.** Domain charter published; route
audit confirms no merge-eligible duplicates beyond the legacy
redirects already in place; auth/role guards verified.
