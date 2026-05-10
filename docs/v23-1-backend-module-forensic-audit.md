# Backend module forensic audit (v23.1)

> **WARNING — Read-only audit.** No `Module` was removed from `AppModule`; no folders were deleted. This document records what was *examined*, not what was *changed*.

## Scope

- **Source of truth:** `d:\Safari-ERP\src\app.module.ts` — `imports` array (excluding `ScheduleModule.forRoot()`, `EventEmitterModule.forRoot()`, conditional `ServeStaticModule`).
- **Total Nest feature modules counted:** **65**

## Full list (AppModule `imports`)

`SecretsModule`, `ObservabilityModule`, `PrismaModule`, `PermissionsModule`, `AccountingModule`, `CashIntelligenceModule`, `CashMonitorModule`, `FinanceModule`, `PeriodsModule`, `OutstandingModule`, `DomainEventsModule`, `FinancialSnapshotsModule`, `DebtVisibilityModule`, `ReadModelsModule`, `FinancialTimelineModule`, `CollectionsIntelligenceModule`, `AuthModule`, `SafariStreamModule`, `PresenceModule`, `CollectionsWorkflowModule`, `UsersModule`, `ReportsModule`, `PaymentMethodFeesModule`, `SystemModule`, `SystemConfigModule`, `SystemGuardianModule`, `SystemSettingsModule`, `CommissionsModule`, `DebtHoldsModule`, `ExpensesModule`, `ExportsModule`, `PayrollModule`, `FixedExpenseModule`, `OrdersModule`, `OwnerDashboardModule`, `PaymentsModule`, `BranchesModule`, `WalletsModule`, `AuditLogsModule`, `SubscriptionPlansModule`, `SubscribersModule`, `CallCenterModule`, `InvoiceAuditModule`, `LaundryPriceListModule`, `InventoryModule`, `PurchaseOrdersModule`, `QueueAdminModule`, `InsightsModule`, `ManagerCustodyModule`, `ManagerDocumentsModule`, `DriverOversightModule`, `PosModule`, `CustomersModule`, `DebtTransfersModule`, `DispatchModule`, `SerialsModule`, `ShiftsModule`, `AttendanceModule`, `LeavesModule`, `LoansModule`, `VehicleExpensesModule`, `VerifyModule`, `FeedbackModule`, `HealthModule` — **65 total**.

---

## Bucket summary

| Bucket | Count (approx.) | Notes |
|--------|------------------|--------|
| **CRITICAL_KEEP** | **~45–50** | Auth, permissions, Prisma, observability, secrets; V20 finance stack (`FinanceModule`, `PeriodsModule`, `OutstandingModule`, `DomainEventsModule`, `FinancialSnapshotsModule`, `DebtVisibilityModule`, `ReadModelsModule`, `FinancialTimelineModule`, `CollectionsIntelligenceModule`); accounting/cash intelligence/monitor; canonical domain (`Orders`, `Customers`, `Payments`, `Branches`, `Payroll`, `Wallets`, `CallCenter`, `Dispatch`, etc.); modules **re-imported** elsewhere (e.g. `AttendanceModule` → `ExportsModule`, `LoansModule` → `PayrollModule`, `SerialsModule` → `OrdersModule`, `PaymentMethodFeesModule` → `CommissionsModule`, `ManagerCustodyModule` / `LaundryPriceListModule` → `SafariStreamModule`); **finance →** `subscribers/subscription-state.util`; **main.ts** → `health/readiness.service`; `AuditLogsModule` + `AuditLogsMiddleware` on all routes. |
| **NEEDS_REVIEW** | **~15–20** | Nest **module token** often only referenced from `AppModule` + self, but **HTTP routes, SSE, schedulers, or docs** show active product/ops use — not safe to delete on graph topology alone. |
| **CANDIDATE_REMOVE** | **0** | Under conservative rules, **no** module qualified: each feature area checked had **frontend (`web/src`), documentation, cross-folder imports, and/or cron/schedulers** — or falls under explicit "keep" domain (HR, POS, verify QR, etc.). |

---

## `CANDIDATE_REMOVE` — detail

**None.** No **SAFE_TO_DELETE** candidates.

Reason: For a module to land here it needed: **zero** external imports outside its folder **and** **no** routes referenced in web/tests/docs **and** no crons/listeners. Spot-checks included modules that only register `XxxModule` in `AppModule` (e.g. `Insights`, `Feedback`, `Verify`, `QueueAdmin`, `Presence`, `SafariStream`, `Exports`, `InvoiceAudit`, `FixedExpense`, `VehicleExpenses`, `Shifts`, `Pos`, `Leaves`, `DriverOversight`, `ManagerDocuments`, `SubscriptionPlans`, `OwnerDashboard`) — all showed **`web/src` API usage** and/or **docs** (`docs/architecture/module-ownership.md`, `docs/operations/replay-safety.md`, etc.) and/or **`@Cron`** (e.g. `insights/weekly-executive-report.service.ts`) and/or **worker/scheduler** (`owner-dashboard`).

**Verdict column:** N/A — **no `CANDIDATE_REMOVE` rows.**

*Optional follow-up (human):* `git log -1 --format="%ai"` per folder is only meaningful once a candidate exists.

---

## `NEEDS_REVIEW` — brief notes (thin `XxxModule` graph **but** live surface)

| Module | Why NEEDS_REVIEW |
|--------|--------------------|
| `InsightsModule` | `/api/insights/*`; weekly exec report; **`@Cron`** Sunday job. |
| `FeedbackModule` | Public + staff feedback; `web` routes and `api.ts`. |
| `VerifyModule` | Public QR **`/api/verify/*`**; `DocumentQR.tsx` and print pages. |
| `QueueAdminModule` | BullMQ/DLX ops; **documented** in `docs/operations/*` and `module-ownership.md`. |
| `PresenceModule` | **`/api/presence/*`**; CC + Customer 360 presence UI. |
| `SafariStreamModule` | **`/api/safari-stream/snapshot`**; global provider in `web`. |
| `OwnerDashboardModule` | Finance owner dashboard + **refresh scheduler/worker**. |
| `SubscriptionPlansModule` | **`/api/subscription-plans`**; subscriptions UI. |
| `ExportsModule` | Large **`/api/exports/*`** surface in `api.ts`. |
| `InvoiceAuditModule` | **`/api/invoice-audit/*`**; dedicated pages. |
| `FixedExpenseModule` | **`/api/fixed-expenses`**; nav + pages. |
| `VehicleExpensesModule` | **`/api/vehicle-expenses`**; multiple routes in `App.tsx`. |
| `ShiftsModule` | **`/api/shifts/cycle/*`** in `api.ts`; shift cycle semantics referenced in finance code comments. |
| `PosModule` | Heavy **`/api/pos/*`** offline/POS client. |
| `LeavesModule` | **`/api/leaves/*`** HR flows. |
| `DriverOversightModule` | **`/api/manager/driver-oversight`** + manager pages. |
| `ManagerDocumentsModule` | **`/api/manager/my-documents`** + print routes. |

---

## Frontend / tests / migrations (methodology)

- **Frontend:** Grep of `web/src/**/*.{ts,tsx}` for paths such as `/api/insights`, `/api/feedback`, `/api/verify`, `/api/presence`, `/api/safari-stream`, `/api/queue*`, `/api/exports`, `/api/invoice-audit`, `/api/manager/*`, `/api/pos`, `/api/shifts`, `/api/leaves`, `/api/vehicle-expenses`, `/api/fixed-expenses`, `/api/subscription-plans`, etc.
- **Tests:** No isolated `backend` `queue-admin` `*.spec.ts` hits in a quick search; **frontend** has presence/tests; **not** used as a removal signal when routes + docs exist.
- **Migrations:** Shared **`prisma/migrations`** (many SQL files); schema is **cross-cutting** — cannot prove a module "has no DB" without table-level ownership mapping (not done here).

---

## One-paragraph summary

After parsing **`AppModule`** (**65** feature modules) and cross-checking **`src`** imports, **`web/src`** API and route usage, scheduled jobs, and ops/docs references, **no backend module qualified as `CANDIDATE_REMOVE`**: every area either participates in the **canonical finance/event/read-model stack**, **HR/POS/collections** product surfaces, or **infra** (auth, prisma, audit, health, observability, realtime/presence). The closest pattern to "leaf" modules are **NEEDS_REVIEW** "islands" (**insights, feedback, verify, queue-admin, presence, safari-stream, exports, invoice-audit, fixed/vehicle expenses, shifts, POS, leaves, manager/driver UIs, subscription plans, owner dashboard**) that are **only weakly linked via `Module` imports** but are **clearly active** over HTTP/SSE/cron/docs — **do not delete** without an explicit product deprecation.

---

*Generated: forensic read-only audit. No filesystem changes.*
