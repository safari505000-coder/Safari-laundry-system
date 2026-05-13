# Safari Fast Group ERP — System Architecture Reference

> **Version:** 1.6.0 | **Generated:** 2026-05-13 | **Based on:** full codebase analysis

---

## ✅ Sprint Log

### v1.6.0 — Banking Core + Legacy Cleanup (2026-05-13)
**Banking Core:**
- Journal AR (account 1300) is now the sole canonical source for all live debt
- V20 flags enabled: V20_4_FINAL_LEDGER, USE_JOURNAL_AS_SOURCE, V20_3_TRUE_ACCOUNTING
- All DebtLedgerEntry writes removed — table is archive-only

**Security:**
- Dexie IndexedDB cleared on logout (PII + pending mutations protected)

**Code cleanup:**
- Event bus stubs deleted (Kafka, RabbitMQ, Redis Streams)
- V24 legacy math comment blocks removed
- Serial Counter deprecated constant + peek() removed
- Empty WalletsModule deleted
- round4Kd unified to shared util (Prisma.Decimal ROUND_HALF_EVEN)

**Pending (next sprint):**
- DROP TABLE debt_ledger_entry (blocked by CommissionPayout FK)
- Decouple CommissionPayout.sourceDebtEntryId
- Convert DebtSource to TypeScript enum

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles](#2-user-roles)
3. [Modules](#3-modules)
4. [API Endpoints](#4-api-endpoints)
5. [Database Schema](#5-database-schema)
6. [Tech Stack](#6-tech-stack)

---

## 1. System Overview

### English

**Safari Fast Group ERP** is a full-stack, multi-branch laundry-service management platform built for the Kuwaiti market.  
It covers the complete operational lifecycle:

- **Field operations** — drivers issue invoices via mobile POS, collect cash, and are tracked in real time.
- **Call Center** — agents manage subscriptions, send WhatsApp payment links, track debt recovery, and dispatch drivers.
- **Branch management** — managers record expenses, confirm cash handovers, manage shifts, and monitor stock.
- **Finance & accounting** — accountants reconcile cash, approve deposits, run payroll, close financial periods, and access a full double-entry general ledger.
- **Executive oversight** — owners and general managers see consolidated KPI dashboards, fraud alerts, and P&L reports across all branches.
- **HR** — attendance tracking, leave requests, employee loans, and payroll with commission and debt-hold lines.
- **Inventory** — stock-in/out movements, purchase orders, low-stock alerts, and branch-level cost tracking.
- **Customer portal** — customers log in to view their own 360° ledger and subscription history.

The API is a **NestJS** monolith served on a single port; the **React SPA** is served from the same process. Authentication uses short-lived JWT access tokens (15 min) with rotating refresh tokens.

---

### العربية

**نظام إدارة موارد مجموعة سفاري فاست** هو منصة متكاملة لإدارة خدمات الغسيل متعددة الفروع، مبنية للسوق الكويتي.

يغطي النظام دورة التشغيل الكاملة:

- **عمليات الميدان** — السائقون يصدرون فواتير من خلال نقطة البيع على الجوال ويتتبعون النقد.
- **الكول سنتر** — الموظفون يديرون الاشتراكات، يرسلون روابط الدفع عبر واتساب، ويتابعون تحصيل الديون.
- **إدارة الفروع** — المديرون يسجلون المصروفات، يؤكدون تسليمات النقد، ويراقبون المخزون.
- **المالية والمحاسبة** — المحاسبون يطابقون النقد، يراجعون الودائع، يعالجون الرواتب، ويصلون إلى دفتر الأستاذ.
- **الإشراف التنفيذي** — المالكون والمديرون العامون يرون لوحات مؤشرات أداء موحدة عبر جميع الفروع.
- **الموارد البشرية** — تتبع الحضور، طلبات الإجازات، قروض الموظفين، والرواتب.
- **المخزون** — حركات المخزون، أوامر الشراء، وتنبيهات المخزون المنخفض.
- **بوابة العملاء** — العملاء يطلعون على كشف حساباتهم واشتراكاتهم.

---

## 2. User Roles

All roles are defined in `prisma/schema.prisma` (enum `SafariRole`) and enforced via `src/auth/permissions/roles-permissions.map.ts` and `src/auth/capabilities.ts`.

---

### OWNER — المالك

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.OWNER` |
| **Permissions** | **All** `AppPermission` values (unrestricted) |
| **Default landing** | `/dashboard` (Executive Dashboard) |

**Capabilities:**
- All permissions including invoice create/update/delete/audit, financial reports, payroll, expenses, cash, debts, inventory, audit logs, user management.
- Only role with `CAN_MANAGE_STAFF` builtin capability (create/deactivate users).
- Can update driver GPS/vehicle labels for map testing.
- Can view live invoice feed across all branches.
- Can access debt-recovery reports and fraud alerts.

**Main screens:** Executive Dashboard · All Invoices · Reports (all) · Finance (all) · Payroll · Staff Hub · Branches · System Settings · Audit Logs · Inventory · Subscriptions · Subscribers · Commission Rules · Debt Holds · Debt Transfers · Owner Serials · Monthly Summary

---

### GENERAL_MANAGER — المدير العام

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.GENERAL_MANAGER` |
| **Permissions** | Invoice read/share · Financial reports · Cash · Debts · Inventory · Payroll · Expenses · Audit · Customers · Dispatch (view) · User management |
| **Default landing** | `/dashboard` |

**Capabilities:**
- Read-only on financial data — enforced by `GeneralManagerReadOnlyGuard` (no POST/PATCH/DELETE on non-GET routes).
- Can approve expenses (via `financialOversight` permission set).
- Access to monthly summary, executive summary, money-flow statement.

**Main screens:** Executive Dashboard · All Invoices · Finance Reports · Debt Recovery Report · Monthly Summary · Audit Logs · Staff Hub

---

### MANAGER — مدير الفرع

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.MANAGER` |
| **Permissions** | Invoice CRUD · Reports · Cash · Debts · Inventory · Expenses (create) · Operational data (create/update) · Dispatch (view) · User management |
| **Default landing** | `/dashboard` (branch-scoped) |

**Capabilities:**
- Branch-scoped by JWT `branchId` — all finance/invoice queries are clamped to their branch.
- Confirms cash handovers from drivers (`POST /finance/handover/confirm`).
- Uploads bank deposit receipts.
- Views driver monitoring map (branch-scoped).
- Creates/manages payroll lines for their branch.
- Records `CASH` and `PREPAID_CARD` expenses.
- Can create customers (`CREATE_CUSTOMER` capability).

**Main screens:** Dashboard (branch) · Invoices · My Custody · Shifts · Driver Oversight · Expenses · POS · Reports · Inventory · Payroll

---

### DRIVER — السائق

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.DRIVER` |
| **Permissions** | Invoice read/create/update · Expenses (view/create) · Operational data (create/update) · Dispatch (view) |
| **Default landing** | `/pos` (POS screen) |

**Capabilities:**
- Issues invoices via quick-capture POS (mobile-first).
- Manages personal cash custody (PAID_TO_DRIVER tracking).
- Tracks open shifts (auto-rollover at midnight Kuwait time).
- Records field expenses (SOAP, FUEL, MISC) with receipt photos.
- Views their own pending invoices for field follow-up.
- Can create customers (`CREATE_CUSTOMER` capability).
- Unique prefix assigned by owner (e.g. "A") stamped on invoice serial numbers.

**Main screens:** POS · My Daily Sales · Driver Pending Invoices · My Cash Receipts · My Deposits · Driver Field Expenses · Driver Tasks

---

### WORKER — العامل

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.WORKER` |
| **Permissions** | None |
| **Default landing** | `/dashboard` |

**Capabilities:** No application permissions. Role exists for HR/payroll attribution only.

---

### CALL_CENTER — موظف الكول سنتر

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.CALL_CENTER` |
| **Permissions** | Invoice read/share · Debts · Customers · Dispatch (manage/view) · Customer block management |
| **Default landing** | `/cc/dashboard` (Customer 360 Dashboard) |

**Capabilities:**
- Activates, extends, and cancels customer subscriptions.
- Records partial debt payments and goodwill discounts.
- Sends WhatsApp payment links (MOATMT/webhook or wa.me fallback).
- Marks collection orders as paid.
- Creates reminder logs (24h-guarded counter).
- Searches customers and views their full 360° ledger.
- Manages driver dispatch instructions.
- Can block/unblock customers.
- Cannot issue new invoices (enforced by `Dastur §2, V19.3`).

**Main screens:** CC Dashboard · Customer 360 · Collections Page · Collections Report · WhatsApp Tools · Customers Search · Control Tower

---

### CALL_CENTER_SUPERVISOR — مسؤول الكول سنتر

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.CALL_CENTER_SUPERVISOR` |
| **Permissions** | All CALL_CENTER permissions + Invoice audit (edit/void) · Reports (view) |
| **Default landing** | `/cc-performance` |

**Capabilities:**
- All CALL_CENTER capabilities.
- Same-day invoice edit and soft-void with immutable audit trail (`InvoiceAuditLog`).
- Access to CC agent performance reports.
- Views daily collections reconciliation (TransactionHistory vs GeneralLedger validator).

**Main screens:** CC Performance · CC Dashboard · Collections Cockpit · Invoice Audit Log · Collections Report · All CALL_CENTER screens

---

### FLEET_SUPERVISOR — مسؤول السيارات

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.FLEET_SUPERVISOR` |
| **Permissions** | Expenses (view/create) |
| **Default landing** | `/dashboard` |

**Capabilities:**
- Submits vehicle expense records (fuel, oil change, tires, repairs, etc.) with mandatory receipt photo.
- All submissions start at `PENDING_ACCOUNTANT` — only Accountant/Owner/GM can approve or reject.
- Cannot access financial reports, invoices, or customer data.

**Main screens:** Vehicle Expenses form (dedicated fleet UI)

---

### ACCOUNTANT — المحاسب

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.ACCOUNTANT` |
| **Permissions** | Invoice read/share · Financial reports (all) · Cash · Debts · Inventory · Payroll · Expenses (view + approve) · Audit · Customers · Dispatch (view) |
| **Default landing** | `/dashboard` |

**Capabilities:**
- Approves/rejects branch expenses and vehicle expenses.
- Verifies bank deposit logs (CASH_DEPOSIT_SLIP, KNET_Z_REPORT).
- Full access to double-entry journal and GL reports.
- Runs accountant dashboard (cash pipeline, KPIs, reconciliation, insights).
- Closes and reopens financial periods.
- Views fraud alerts and collections risk scoring.
- KNET audit (reconcile raw KNET transactions with recorded POS sales).
- Stock-in recording.

**Main screens:** Accountant Dashboard · Finance Reports Hub · Unified Ledger · Journal Entries · Unpaid Invoices · Expense Approval · Bank Deposits · KNET Audit · Financial Periods · Inventory Stock In

---

### SUPERVISOR — المشرف

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.SUPERVISOR` |
| **Permissions** | Invoice read/share/update · Reports · Customers · Operational data (update) · User management |
| **Default landing** | `/dashboard` |

**Capabilities:**
- Can update order status and assign drivers.
- Limited operational role; no financial/expense approvals.

**Main screens:** Dashboard · Invoices · Reports · Customers

---

### VIEWER — مراقب

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.VIEWER` |
| **Permissions** | Invoice read/share · Reports · Customers |
| **Default landing** | `/dashboard` |

**Capabilities:** Read-only access to invoices, reports, and customer directory. No write operations.

**Main screens:** Dashboard · Invoices · Reports · Customers

---

### CUSTOMER — العميل (Customer Portal)

| Field | Detail |
|---|---|
| **Defined in** | `prisma/schema.prisma` → `SafariRole.CUSTOMER` |
| **Permissions** | Customers (view — own record only) |
| **Default landing** | `/my-customer-360` |
| **JWT constraint** | `linkedCustomerId` field on JWT scopes every request to a single `Customer` row |

**Capabilities:**
- Views their own 360° ledger (wallet balance, subscription, invoices, transaction history).
- No write operations — purely self-service portal.

**Main screens:** Customer Portal 360

---

## 3. Modules

### 3.1 Backend Modules (`src/`)

| Module | Folder | Purpose |
|---|---|---|
| **Auth** | `auth/` | JWT login/refresh/logout, password change, role & permission guards, bcrypt worker |
| **Orders (Invoices)** | `orders/` | Invoice lifecycle (PENDING → COMPLETED/CANCELED), serial number stamping, collections sub-routes |
| **POS** | `pos/` | Driver/manager point-of-sale checkout, multi-invoice payment bundles, UPayments gateway integration |
| **Customers** | `customers/` | Customer CRM, block/unblock, PBX phone lookup |
| **Call Center** | `call-center/` | Subscriptions, debt recovery, WhatsApp tools, customer 360 ledger, daily collections, CC performance |
| **Finance** | `finance/` | Cash reconciliation, driver balances, handover confirmation, daily POS sales, debt reports, accountant dashboard, owner financial dashboard |
| **Finance — Deposits** | `finance/` (deposits.controller.ts) | Driver deposit (CASH/KNET) CRUD with Accountant approval |
| **Finance — Bank Deposits** | `finance/` (bank-deposits.controller.ts) | Manager bank-slip / KNET-Z-report upload and Accountant verification |
| **Finance — Journal** | `finance/journal.controller.ts` | Double-entry journal entry listing and branch ledger |
| **Finance — Ledger** | `finance/ledger/` | GL ledger stream, bank statement, account balances |
| **Finance — Outstanding** | `finance/outstanding/` | AR outstanding list, aging buckets, payment collection status |
| **Finance — Periods** | `finance/periods/` | Monthly financial period close/reopen (Owner + Accountant) |
| **Finance — Collections** | `finance/collections/` | Collections workflow controller (promise-to-pay, stage events) |
| **Finance — Aging** | `finance/aging/` | Debt aging report |
| **Finance — Promises** | `finance/promises/` | Promise-to-Pay CRUD and event log |
| **Finance — Risk** | `finance/risk/` | Real-time customer risk scoring |
| **Finance — Fraud** | `finance/fraud/` | Fraud alert detection and resolution |
| **Finance — Audit** | `finance/audit/` | Financial audit reconciliation triage view |
| **Finance — Timeline** | `finance/timeline/` | Customer financial timeline |
| **Finance — Sales & Debt Analytics** | `finance/sales-debt-analytics/` | Sales vs debt trend analytics |
| **Finance — Debt Visibility** | `finance/debt-visibility/` | FinancialSnapshot read-model queries |
| **Finance — Snapshots** | `finance/snapshots/` | FinancialSnapshot rebuilds and cron refresh |
| **Finance — Collections Intelligence** | `finance/collections-intelligence/` | Collector assignment and SLA scoring |
| **General Ledger** | `general-ledger/` | Double-entry journal write service, account chart |
| **Reports** | `reports/` | Issued invoices, driver ledger, daily cash closing, executive summary, monthly summary, money flow, bank fees, unified ledger stream |
| **Payments** | `payments/` | UPayments gateway charge creation, webhook/callback finalization, hosted-checkout status polling |
| **Accounting** | `accounting/` | Chart of accounts management |
| **Branches** | `branches/` | Branch CRUD |
| **Users** | `users/` | Staff directory, create/update/activate/deactivate, salary defaults, password reset |
| **Subscription Plans** | `subscription-plans/` | Plan catalogue (name, sale price, wallet credit, validity days) |
| **Subscribers** | `subscribers/` | Active subscriber list, expiry monitoring |
| **Customer Ledger** | `customer-ledger/` | Subscription settlement types and ledger logic |
| **Shifts** | `shifts/` | Driver shift open/close, handover reconciliation |
| **Attendance** | `attendance/` | Daily attendance logs, biometric/manual entry, reports |
| **Leaves** | `leaves/` | Employee leave request workflow (PENDING → APPROVED/REJECTED) |
| **Loans** | `loans/` | Employee salary advance lifecycle, payroll instalment deduction |
| **Payroll** | `payroll/` | Monthly payroll rows, ad-hoc lines, mark-paid, roster print |
| **Commissions** | `commissions/` | Commission rules (SALE / COLLECTION modes) and payout ledger |
| **Debt Holds** | `debt-holds/` | Salary hold slips for customer debt recovery |
| **Debt Transfers** | `debt-transfers/` | Driver departure debt transfer workflow (DRAFT → COMPLETED) |
| **Expenses** | `expenses/` | Branch variable expenses (SOAP/FUEL/MISC), approval workflow |
| **Fixed Expenses** | `fixed-expenses/` | Recurring branch overheads (rent, electricity, lease) |
| **Vehicle Expenses** | `vehicle-expenses/` | Fleet expense submissions with mandatory receipt |
| **Manager Custody** | `manager-custody/` | Manager cash custody lifecycle (PENDING_DEPOSIT → VERIFIED/REJECTED), cash-flow aliases |
| **Inventory** | `inventory/` | Stock items, branch levels, movements (IN/OUT/ADJUSTMENT/TRANSFER) |
| **Purchase Orders** | `purchase-orders/` | PO workflow (DRAFT → SENT → RECEIVED), receipt lines |
| **Laundry Price List** | `laundry-price-list/` | Garment tariff (Normal/Urgent/Press), category management, branch overrides |
| **Driver Oversight** | `driver-oversight/` | Manager view of driver field activity and metrics |
| **Dispatch** | `dispatch/` | CC → Driver dispatch instruction lifecycle |
| **Collections Workflow** | `collections-workflow/` | Collections workbench (promise-to-pay, stage transitions) |
| **Invoice Audit** | `invoice-audit/` | CC Supervisor same-day edit/void audit trail |
| **Wallets** | `wallets/` | Branch wallets |
| **Serials** | `serials/` | Invoice serial number counters per operator prefix |
| **Owner Dashboard** | `owner-dashboard/` | Owner KPI aggregates |
| **Cash Intelligence** | `cash-intelligence/` | Real-time cash pool analytics |
| **Cash Monitor** | `cash-monitor/` | Cash write guard (prevents forbidden cash-override fields) |
| **Insights** | `insights/` | Rule-based finance insights feed |
| **Presence** | `presence/` | Online/offline user presence tracking (SSE) |
| **Safari Stream** | `safari-stream/` | Server-Sent Events (SSE) real-time push to frontend |
| **Domain Events** | `domain-events/` | EventEmitter2-based domain events + financial event outbox |
| **Read Models** | `read-models/` | CQRS read-side projections |
| **Observability** | `observability/` | Prometheus metrics, OpenTelemetry tracing |
| **Audit Logs** | `audit-logs/` | Immutable per-request action audit with hash chain |
| **Permissions** | `permissions/` | Dynamic role↔permission assignment (DB-backed RBAC) |
| **Exports** | `exports/` | Excel report export |
| **Feedback** | `feedback/` | Customer QR star rating and free-text note |
| **System** | `system/` | System health endpoints |
| **System Config** | `system-config/` | Runtime feature flags |
| **System Guardian** | `system-guardian/` | Startup data-integrity checks (BackfillAuditLock) |
| **System Settings** | `system-settings/` | Operator-editable settings (WhatsApp, gateway config) |
| **Payment Method Fees** | `payment-method-fees/` | KNET/card fee config (flat + % rules) |
| **Health** | `health/` | NestJS Terminus health check + version endpoint |
| **Verify** | `verify/` | Token/signature verification utilities |
| **Queue Admin** | `queue-admin/` | BullMQ queue inspection |

---

### 3.2 Frontend Modules (`web/src/`)

| Module | Folder | Purpose |
|---|---|---|
| **Shared** | `modules/shared/` | Shell layouts (auth, executive), routing helpers, lazy loading, common UI components |
| **Owner** | `modules/owner/` | Owner Dashboard, Manage Items (price list), Inventory Report |
| **Accountant** | `modules/accountant/` | KNET Audit, Inventory Report, Stock In |
| **Manager** | `modules/manager/` | My Custody, My Documents, Shifts, Driver Oversight, Expense Voucher Print |
| **Driver** | `modules/driver/` | Driver POS, My Daily Sales, Pending Invoices, Cash Receipts, Deposits, Field Expenses, Driver Tasks |
| **Call Center** | `modules/call-center/` | CC Dashboard, Customer 360 (v1+v2), Collections Page, Collections Cockpit, Collections Report, WhatsApp Tools, Customers Search, Control Tower |
| **Finance** | `modules/finance/` | Full Journal Entries component, finance API hooks |
| **Collections Workflow** | `modules/collections-workflow/` | Collections Operations Workspace, Collections Workspace Shell |
| **Presence / Realtime Observability** | `modules/realtime-observability/` | Real-time ops monitoring |
| **Call Center Supervisor** | `modules/call-center-supervisor/` | CC performance and supervisor tools |

**Top-level pages (`web/src/pages/`):**  
Login · Force Change Password · Executive Dashboard · Orders · POS Route · Subscribers · Subscriptions · Payroll · Attendance · Leaves · Loans · Expenses · Fixed Expenses · Staff Hub · Commission Rules · Commission Payouts · Debt Holds · Debt Transfers · My Debt Transfers · Finance (Accountant Dashboard · Unpaid Invoices · Money Flow Statement · Financial Cycle Report · Driver Cash Trace · Cash Reconciliation · Finance Ledger Reports · Unified Ledger · Ledger Bank Statement) · Reports (Reports Hub · Sales Summary · Monthly Summary · Financial Reports Hub · Operational Reports Hub) · All Invoices · Invoice Audit Log · Customers · Customer Portal 360 · Call Incoming · Driver Monitor · Live Monitor · Branches · System Settings · Payment Method Fees · Audit Logs · Owner Serials · Inventory (Catalog · Operations · Movements · Low Stock) · Purchase Orders · Insights AI · Manager Custody Aging · Staff Debts · Debt Recovery Report · Feedback Inbox · CC Performance · Public pages (Statement · Invoice · Feedback · Payment Success/Failed)

---

## 4. API Endpoints

All routes are prefixed `/api`. Authentication: `Authorization: Bearer <access_token>` (except `@Public` routes).

---

### 4.1 Auth — `/api/auth`

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Username/password login → access token + refresh token |
| POST | `/auth/refresh-token` | Public | Exchange refresh token for new access token (rotates token) |
| POST | `/auth/logout` | Public | Revoke refresh token |
| POST | `/auth/change-password` | All institutional | Change own password (also used for forced change on first login) |

---

### 4.2 Orders (Invoices) — `/api/orders`

| Method | Path | Required Permission / Role | Purpose |
|---|---|---|---|
| GET | `/orders/manager-dashboard` | VIEW_INVOICES + VIEW_REPORTS | Active pipeline + per-driver revenue |
| POST | `/orders/quick` | CREATE_INVOICE | Driver quick-capture invoice |
| POST | `/orders` | CREATE_INVOICE | Back-office invoice creation (MANAGER) |
| GET | `/orders` | VIEW_INVOICES | List invoices (role-scoped) |
| GET | `/orders/branch-drivers` | VIEW_INVOICES | Dropdown of drivers for invoice filter |
| GET | `/orders/collections/unpaid-online/report` | CALL_CENTER / CC_SUPERVISOR | Collections debt-tracking report |
| GET | `/orders/collections/unpaid-online` | CALL_CENTER / CC_SUPERVISOR | All unpaid invoices for collections |
| GET | `/orders/stale-quick-risks` | AUDIT_INVOICE | Pending invoices >24h (accountability watchdog) |
| GET | `/orders/driver/pending-invoices` | DRIVER | My unpaid invoices for field follow-up |
| POST | `/orders/:id/invoice-share-link` | SHARE_INVOICE | Mint 7-day public invoice URL |
| GET | `/orders/:id` | VIEW_INVOICES | Get single order (role-scoped) |
| PATCH | `/orders/:id/assign-driver` | UPDATE_OPERATIONAL_DATA | Reassign driver on order |
| PATCH | `/orders/:id` | UPDATE_INVOICE | Update order status/notes |

---

### 4.3 Finance — `/api/finance`

| Method | Path | Required Permission / Role | Purpose |
|---|---|---|---|
| POST | `/finance/driver/ensure-shift` | DRIVER | Ensure open shift (auto-rollover midnight) |
| GET | `/finance/owner/customer-wallet-summary` | OWNER / GM | Customer prepaid balance + debt totals |
| GET | `/finance/owner-dashboard` | OWNER / GM / ACCOUNTANT | Owner financial intelligence dashboard |
| GET | `/finance/consolidated-cash` | VIEW_CASH | All cash pools snapshot |
| GET | `/finance/reports/daily-pos-sales` | OWNER / GM / MANAGER / ACCOUNTANT / SUPERVISOR (+ DRIVER own) | Daily POS sales by payment method |
| GET | `/finance/reports/debt-by-category` | VIEW_DEBTS | Debt breakdown by entity category |
| GET | `/finance/reports/open-debt-by-issuer` | VIEW_DEBTS | Net open debt by invoice issuer |
| POST | `/finance/handover/upload-receipt` | MANAGER | Upload bank deposit receipt image |
| GET | `/finance/driver-balance` | VIEW_CASH | Per-driver cash on hand |
| GET | `/finance/driver/my-cash-custody` | DRIVER | My cash custody summary |
| GET | `/finance/driver-monitoring` | OWNER / GM / MANAGER / CALL_CENTER / CC_SUPERVISOR | Driver map feed |
| PATCH | `/finance/driver-monitoring/:driverId` | OWNER | Update driver map fields (test hook) |
| POST | `/finance/handover/confirm` | MANAGER | Confirm cash handover (atomic settlement) |
| GET | `/finance/reports/financial-cycle` | OWNER / GM | Financial cycle lifecycle report |
| GET | `/finance/reports/driver-cash-trace` | VIEW_CASH | Driver cash trace report |
| GET | `/finance/reports/cash-reconciliation` | VIEW_CASH | Cash reconciliation snapshot |
| GET | `/finance/reports/unpaid-invoices` | VIEW_DEBTS | Unpaid invoices list with AR detail |
| GET | `/finance/outstanding-debts-without-links` | VIEW_DEBTS | Customers with debt and no active payment link |
| POST | `/finance/generate-settlement-link` | VIEW_DEBTS | Generate one payment link for selected invoices |
| GET | `/finance/dashboard-summary` | OWNER / GM / ACCOUNTANT | Accountant interactive dashboard (cached) |
| GET | `/finance/reconciliation/explain` | OWNER / GM / ACCOUNTANT | Reconciliation timing lag breakdown |
| GET | `/finance/reconciliation` | OWNER / GM / ACCOUNTANT | Collected vs handed reconciliation |
| GET | `/finance/alerts` | OWNER / GM / ACCOUNTANT / MANAGER | Finance alerts |
| GET | `/finance/insights` | OWNER / GM / ACCOUNTANT | Rule-based finance insights |
| GET | `/finance/dashboard/realtime-totals` | VIEW_CASH + VIEW_DEBTS | Realtime KPI card totals |

---

### 4.4 Finance — Deposits, Bank Deposits, Journal, Ledger

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/finance/deposits` | DRIVER | Create cash/KNET deposit |
| GET | `/finance/deposits` | OWNER / GM / ACCOUNTANT / DRIVER (own) | List deposits |
| PATCH | `/finance/deposits/:id/audit` | ACCOUNTANT | Approve or reject deposit |
| POST | `/finance/bank-deposits` | MANAGER | Upload bank-deposit slip or KNET Z-report |
| GET | `/finance/bank-deposits` | OWNER / GM / ACCOUNTANT | List bank deposit logs |
| PATCH | `/finance/bank-deposits/:id/verify` | ACCOUNTANT | Verify bank deposit |
| GET | `/finance/journal` | OWNER / GM / ACCOUNTANT | List double-entry journal entries |
| GET | `/finance/journal/:id` | OWNER / GM / ACCOUNTANT | Single journal entry with lines |
| GET | `/finance/ledger/stream` | OWNER / GM / ACCOUNTANT | Unified GL stream |
| GET | `/finance/ledger/bank-statement` | OWNER / GM / ACCOUNTANT | Bank statement view |
| GET | `/finance/ledger/account-balances` | OWNER / GM / ACCOUNTANT | Chart-of-accounts current balances |
| GET | `/finance/outstanding` | VIEW_DEBTS | AR outstanding list |
| GET | `/finance/periods` | OWNER / ACCOUNTANT | Financial period list |
| POST | `/finance/periods/:year/:month/close` | OWNER / ACCOUNTANT | Close a financial period |
| POST | `/finance/periods/:year/:month/reopen` | OWNER / ACCOUNTANT | Reopen a closed period |

---

### 4.5 Call Center — `/api/call-center`

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/call-center/operations-summary` | CALL_CENTER / CC_SUPERVISOR | 3 KPIs (red debt / green collected today / yellow pending links) |
| GET | `/call-center/debt-recovery-report` | OWNER / GM | Daily debt-settled breakdown |
| GET | `/call-center/subscription-plans` | CALL_CENTER / CC_SUPERVISOR | Active plan catalogue |
| GET | `/call-center/customers` | CALL_CENTER / CC_SUPERVISOR | Customer search |
| POST | `/call-center/subscriptions/activate` | CALL_CENTER / CC_SUPERVISOR | Activate subscription for customer |
| POST | `/call-center/subscriptions/cancel` | CALL_CENTER / CC_SUPERVISOR | Cancel active subscription |
| POST | `/call-center/subscriptions/extend` | CALL_CENTER / CC_SUPERVISOR | Extend subscription by N days |
| POST | `/call-center/orders/:orderId/reminder` | CALL_CENTER / CC_SUPERVISOR | Mark collection reminder sent (24h-guarded) |
| POST | `/call-center/orders/:orderId/payment-link` | CALL_CENTER / CC_SUPERVISOR | Ensure hosted payment link for unpaid order |
| POST | `/call-center/orders/:orderId/send-payment-link-whatsapp` | CALL_CENTER / CC_SUPERVISOR | Push payment-link WhatsApp message |
| POST | `/call-center/orders/:orderId/mark-paid` | CALL_CENTER / CC_SUPERVISOR | Manually mark collection order as paid |
| POST | `/call-center/subscribers/:customerId/reminder` | CALL_CENTER / CC_SUPERVISOR / OWNER | Send subscription renewal reminder |
| GET | `/call-center/customers/:customerId/settlements` | CALL_CENTER / CC_SUPERVISOR | Customer settlement history |
| GET | `/call-center/customers/:customerId/subscription-rollover-preview` | CALL_CENTER / CC_SUPERVISOR | Preview next subscription rollover |
| POST | `/call-center/customers/:customerId/partial-debt-payment` | CALL_CENTER / CC_SUPERVISOR | Partial debt payment + discount |
| GET | `/call-center/customers/:customerId/subscriptions` | CALL_CENTER / CC_SUPERVISOR | Customer subscription chain |
| GET | `/call-center/customers/:customerId/ledger` | CALL_CENTER / CC_SUPERVISOR / OWNER / GM / ACCOUNTANT | Customer 360 ledger |
| POST | `/call-center/customers/:customerId/statement-share-link` | CALL_CENTER / CC_SUPERVISOR / OWNER / GM / ACCOUNTANT | Mint public WhatsApp statement link |
| GET | `/call-center/daily-collections` | CALL_CENTER / CC_SUPERVISOR | Daily debt-reduction feed |
| GET | `/call-center/daily-collections/reconciliation` | CALL_CENTER / CC_SUPERVISOR | TH ↔ GL drift validator |
| GET | `/call-center/customers/:customerId/debt-conversion-options` | CALL_CENTER / CC_SUPERVISOR / OWNER / GM / ACCOUNTANT | Debt-to-subscription preview |

---

### 4.6 Reports — `/api/reports`

| Method | Path | Required Permission / Role | Purpose |
|---|---|---|---|
| GET | `/reports/issued-invoices` | VIEW_INVOICES + VIEW_REPORTS | Invoices created in period |
| GET | `/reports/live-feed` | OWNER | Recent invoices live feed |
| GET | `/reports/driver-ledger` | VIEW_CASH + VIEW_REPORTS | Driver cash vs office |
| GET | `/reports/daily-cash-closing` | VIEW_CASH + VIEW_REPORTS | Gross CASH sales minus expenses |
| GET | `/reports/executive-summary` | OWNER / GM | Net profit and executive KPIs |
| GET | `/reports/monthly-summary` | OWNER / GM | Consolidated P&L + per-branch rows |
| GET | `/reports/money-flow-statement` | VIEW_FINANCIAL_REPORTS | Consolidated money flow with GL rollups |
| GET | `/reports/bank-fees-by-branch` | OWNER / GM | KNET/card fees per branch |
| GET | `/reports/unified-ledger-stream` | VIEW_FINANCIAL_REPORTS | POS + expenses + deposits stream |

---

### 4.7 Remaining Key Endpoints (Summary)

| Group | Example Endpoints | Key Roles |
|---|---|---|
| **Users** | `GET/POST/PATCH/DELETE /users`, `PATCH /users/:id/status`, `POST /users/bulk-reset-password` | OWNER / GM / MANAGER / SUPERVISOR |
| **Branches** | `GET/POST/PATCH /branches` | OWNER / GM |
| **Expenses** | `GET/POST /expenses`, `PATCH /expenses/:id/status` | MANAGER / DRIVER (create), ACCOUNTANT (approve) |
| **Fixed Expenses** | `GET/POST/PATCH/DELETE /fixed-expenses` | OWNER / GM / ACCOUNTANT |
| **Vehicle Expenses** | `GET/POST /vehicle-expenses`, `PATCH /vehicle-expenses/:id/review` | FLEET_SUPERVISOR (create), ACCOUNTANT (approve) |
| **Payroll** | `GET/POST /payroll`, `PATCH /payroll/:id/mark-paid`, `GET/POST /payroll/adhoc-lines` | OWNER / MANAGER |
| **Attendance** | `GET/POST/PATCH /attendance` | OWNER / GM / MANAGER / ACCOUNTANT |
| **Leaves** | `GET/POST /leaves`, `PATCH /leaves/:id/approve` | All staff (submit), OWNER/GM/MANAGER (approve) |
| **Loans** | `GET/POST /loans`, `PATCH /loans/:id/approve` | All staff (submit), OWNER (approve) |
| **Commissions** | `GET/POST/PATCH /commissions/rules`, `GET /commissions/payouts` | OWNER / GM / ACCOUNTANT |
| **Debt Holds** | `GET/POST /debt-holds`, `PATCH /debt-holds/:id/disburse` | OWNER / ACCOUNTANT |
| **Debt Transfers** | `GET/POST /debt-transfers`, `PATCH /debt-transfers/:id/sign`, `PATCH /debt-transfers/:id/finalize` | GM / ACCOUNTANT (create), DRIVER (sign) |
| **Manager Custody** | `GET/POST /manager-custody`, `PATCH /manager-custody/:id/verify` | MANAGER (create), ACCOUNTANT (verify) |
| **Shifts** | `GET /shifts`, `POST /shifts/close` | MANAGER / DRIVER |
| **Dispatch** | `GET/POST /dispatch`, `PATCH /dispatch/:id/complete` | CALL_CENTER (manage), DRIVER (view) |
| **Inventory** | `GET /inventory`, `POST /inventory/stock-in`, `GET /inventory/low-stock` | ACCOUNTANT (stock-in), OWNER/GM/MANAGER (view) |
| **Purchase Orders** | `GET/POST /purchase-orders`, `POST /purchase-orders/:id/receipt` | MANAGER (create), ACCOUNTANT (receive) |
| **Laundry Price List** | `GET/POST/PATCH /laundry-price-list` | OWNER / GM (manage) |
| **Subscription Plans** | `GET/POST/PATCH /subscription-plans` | OWNER / GM |
| **Payments** | `POST /payments/checkout`, `POST /payments/callback` | System/gateway |
| **Feedback** | `GET /feedback`, `POST /feedback/public/:orderId` | Public (submit), OWNER/GM/CC_SUPERVISOR (view inbox) |
| **Invoice Audit** | `GET /invoice-audit/logs`, `PATCH /invoice-audit/:id/edit`, `PATCH /invoice-audit/:id/void` | CC_SUPERVISOR (edit/void), OWNER/GM/ACCOUNTANT (view) |
| **Payment Method Fees** | `GET/PATCH /payment-method-fees` | OWNER |
| **Permissions** | `GET/POST /permissions`, `GET/POST /permissions/roles` | OWNER |
| **Customers** | `GET/POST /customers`, `PATCH /customers/:id/block` | MANAGER/DRIVER (create), CALL_CENTER (block) |
| **Serials** | `GET /serials` | OWNER / GM |
| **Audit Logs** | `GET /audit-logs` | VIEW_AUDIT_LOGS |
| **Health** | `GET /health`, `GET /version` | Public |
| **Queue Admin** | `GET /queue-admin/jobs` | OWNER |

---

## 5. Database Schema

Database: **PostgreSQL 16** via **Prisma ORM 7**. All PKs are `UUID`. Currency stored as `Decimal(19,4)` (KWD 3 decimal places in practice). All tables have `createdAt` / `updatedAt` timestamps.

---

### 5.1 Core Entities

```
User ──── Branch (optional branchId)
 │         └─ LaundryBranchItemPrice
 │         └─ BranchStockLevel
 │         └─ BranchExpense
 │         └─ Wallet
 │         └─ Payroll
 │         └─ PayrollAdHocLine
 │         └─ FixedExpenseSchedule
 │         └─ ManagerCashCustody
 │         └─ AttendanceLog
 │         └─ PurchaseOrder
 │         └─ JournalEntry (branchId)

Customer ──── CustomerWallet (1:1)
 │             └─ SubscriptionPlan (FK)
 │         └─ CustomerSubscription (1:many, chain)
 │         └─ Order (1:many)
 │         └─ DebtLedgerEntry (1:many)
 │         └─ TransactionHistory (1:many)
 │         └─ FinancialSnapshot (1:1, read-model)
 │         └─ CustomerCollectionStatus (1:1)
 │         └─ CollectionsAccount (1:1)
 │         └─ PromiseToPay (1:many)
 │         └─ FraudAlert (1:many)
```

---

### 5.2 Main Tables

| Table | Key Columns | Relationships |
|---|---|---|
| **User** | id, username, password, fullName, safariRole, branchId, roleId, isActive, driverPrefix, civilId, basicMonthlySalary, hireDate | → Branch, Role, Customer (portal), many back-relations |
| **RefreshToken** | id, userId, tokenHash (SHA-256), expiresAt, usedAt, revokedAt | → User |
| **Customer** | id, phone, phone2, displayName, address, originBranchId, isBlocked | → Branch, orders, wallet, subscriptions, ledger entries |
| **CustomerWallet** | id, customerId, balance, debt, subscriptionActivatedAt, subscriptionExpiresAt, subscriptionPlanId | → Customer, SubscriptionPlan |
| **CustomerSubscription** | id, customerId, planId, status, planNameSnapshot, planSalePriceSnapshot, carriedBalanceKd, activatedAt, expiresAt, parentSubscriptionId | → Customer, SubscriptionPlan, parent (chain) |
| **SubscriptionPlan** | id, name, salePrice, actualBalance, validityDays, isActive | → CustomerWallet (many), CustomerSubscription (many) |
| **Order** | id, status, serviceType, totalPrice, cashStatus, serialNumber, invoiceNumber, customerId, driverId, posPaymentMethod, completedAt, dispatchId, subscriptionId, dueDate | → Customer, User (driver), Subscription, Dispatch, PosPaymentBundle |
| **OrderLineItem** | id, orderId, label, starchOption, quantity, unitPrice, stockItemId | → Order, StockItem |
| **DebtLedgerEntry** | id, customerId, orderId, source (SUBSCRIPTION_OVERUSE \| INVOICE_SHORTFALL \| PAYMENT), category, amount, actorUserId, refEntryId | → Customer, Order, User, Branch |
| **TransactionHistory** | id, type, customerId, orderId, subscriptionId, amount, balanceBefore, balanceAfter, debtBefore, debtAfter, performedById | → Customer, Order, CustomerSubscription, User |
| **GeneralLedgerEntry** | id, entryType, amount, memo, metadata, customerId, orderId, expenseId, actorUserId | Flat GL (legacy, pre-double-entry) |
| **Account** | id, code, name, type (ASSET\|LIABILITY\|EQUITY\|REVENUE\|EXPENSE), isActive | → JournalLine |
| **JournalEntry** | id, source, sourceRef (unique), actorUserId, customerId, orderId, branchId | → JournalLine, Branch |
| **JournalLine** | id, entryId, accountId, debit, credit | → JournalEntry, Account |
| **FinancialSnapshot** | id, customerId, journalArBalanceKd, remainingDebtKd, walletBalanceKd, riskLevel, agingBucket, collectionsStage, overdueAmountKd, refreshedAt | → Customer (1:1, derived/rebuildable) |
| **FinancialKpiSnapshot** | id, kpiKey, scope, payload (JSON), computedAt | Materialised KPI cache |
| **Branch** | id, name, location, isActive, isAdministrative, payrollRosterSortOrder | → User (many), expenses, wallets, payrolls, etc. |
| **Shift** | id, driverId, status (OPEN\|CLOSED), startedAt, endedAt, systemHandoverTotal, confirmedByManagerId | → User (driver), BankDepositLog, ManagerCashCustody |
| **BankDepositLog** | id, depositType (CASH_DEPOSIT_SLIP\|KNET_Z_REPORT), status, amountKd, receiptImageUrl, shiftId, managerCashCustodyId, uploadedById, verifiedByAccountantId | → Shift, ManagerCashCustody, User |
| **Deposit** | id, driverId, amount, type (CASH\|KNET), receiptImage, status (PENDING\|APPROVED\|REJECTED) | → User |
| **ManagerCashCustody** | id, status (PENDING_DEPOSIT→AWAITING_VERIFICATION→VERIFIED/REJECTED), managerId, driverId, amountKd | → User (manager), User (driver), Shift, BankDepositLog |
| **BranchExpense** | id, title, amount, category (SOAP\|FUEL\|MISC), expenseMethod, status, recordedById, branchId | → User, Branch |
| **VehicleExpense** | id, vehiclePlate, expenseType, amount, status (PENDING_ACCOUNTANT\|APPROVED\|REJECTED), submittedById, reviewedById | → User |
| **FixedExpenseSchedule** | id, branchId, title, category (RENT\|ELECTRICITY\|LEASE\|OTHER), monthlyAmount, effectiveFrom, effectiveTo | → Branch |
| **Payroll** | id, userId, branchId, basicSalary, allowances, deductions, commissionAmount, debtHoldAmount, loanDeduction, status | → User, Branch |
| **PayrollAdHocLine** | id, branchId, periodYm, beneficiaryName, bankIban, basicSalary | → Branch |
| **AttendanceLog** | id, userId, branchId, date (Kuwait local), checkInAt, checkOutAt, source (SHIFT_AUTO\|BIOMETRIC\|MANUAL) | → User, Branch |
| **LeaveRequest** | id, userId, type, startDate, endDate, status (PENDING\|APPROVED\|REJECTED\|CANCELLED), approvedById | → User |
| **EmployeeLoan** | id, userId, amount, monthlyDeduction, remaining, status, lastDeductionYearMonth | → User |
| **CommissionPayout** | id, earner (userId), payrollId, sourceOrder / sourceDebtEntry, amount | → User, Payroll, Order, DebtLedgerEntry |
| **DebtHold** | id, employee (userId), payrollId, holdAmount, disbursedById | → User, Payroll |
| **DebtTransfer** | id, status (DRAFT→AWAITING_SIGNATURES→COMPLETED/CANCELLED), sourceDriverId, targetDriverId, executorId | → User (3 roles) |
| **Dispatch** | id, customerId, driverId, status, createdById | → Customer, User (driver), User (creator) |
| **InvoiceAuditLog** | id, orderId, action (EDIT\|VOID), actorId, beforeSnapshot, afterSnapshot | → Order, User |
| **StockItem** | id, code, nameAr, nameEn, unit, reorderPointDefault, lastUnitCost | → InventoryCategory, BranchStockLevel, StockMovement |
| **BranchStockLevel** | id, branchId, stockItemId, quantityOnHand, reorderPoint, avgUnitCost | → Branch, StockItem |
| **StockMovement** | id, stockItemId, branchId, type (STOCK_IN\|STOCK_OUT\|ADJUSTMENT\|TRANSFER_IN\|TRANSFER_OUT), quantity, unitCost, supplierId | → StockItem, Branch, Supplier, User |
| **PurchaseOrder** | id, branchId, supplierId, status (DRAFT→SENT→PARTIALLY_RECEIVED→RECEIVED), createdById, approvedById | → Branch, Supplier, User |
| **LaundryPriceListItem** | id, code, nameAr, priceNormal, priceUrgent, pricePressOnly, isActive | → LaundryItemCategory, LaundryBranchItemPrice |
| **OrderFeedback** | id, orderId, rating (1..5), note, submittedFrom, acknowledgedAt | → Order |
| **AuditLog** | id, userId, role, action, resource, endpoint, method, status, ip, changes (JSON), hash, prevHash | Hash-chain immutable audit |
| **SerialCounter** | key (e.g. `OU_<userId>`), value (monotonic int) | Atomic serial stamp per operator |
| **PaymentMethodFeeConfig** | id (singleton), knetFlatKd, knetPercentOfGross, knetRule, cardPercentOfGross | System-wide fee config |
| **CollectionsAccount** | id, customerId, currentStage (NEW→CLOSED), assignedCollectorId, escalationLevel, nextActionDueAt | → Customer, User |
| **PromiseToPay** | id, customerId, invoiceId, promisedAmount, promisedDate, status (ACTIVE\|KEPT\|BROKEN\|CANCELLED), collectorId | → Customer, Order, User |
| **FinancialPeriod** | id, year, month, status (OPEN\|CLOSED), lockedById | → User |
| **FraudAlert** | id, type, severity (LOW\|MEDIUM\|HIGH\|CRITICAL), status, customerId, actorId, fingerprint | → Customer, User |
| **FinancialEventOutbox** | id, eventId (unique), eventName, payload (JSON), deliveredAt | Event sourcing outbox |
| **BackfillAuditLock** | id (singleton), isLocked, checksumLedger, checksumWallet | Startup data-integrity guard |
| **Role** | id, name | → User (many), Permission (many:many) |
| **Permission** | id, key | → Role (many:many) |
| **Wallet** | id, branchId, balance, currency | → Branch |

---

### 5.3 Key Relationships Diagram (Simplified)

```
SubscriptionPlan ←── CustomerSubscription ←── Order ──── OrderLineItem
                            │                    │              │
                     CustomerWallet         DebtLedgerEntry  StockItem ── BranchStockLevel
                            │
                        Customer ──── FinancialSnapshot (read-model)
                            │    └──── CollectionsAccount ── PromiseToPay
                            │    └──── FraudAlert
                            │
User ──────────────── Order (driverId) ──── JournalEntry ──── JournalLine ──── Account
 │                         │
 └── Branch ───────── ManagerCashCustody ──── BankDepositLog
                           │
                        Shift ──── Payroll ──── CommissionPayout
                                              └── DebtHold
```

---

## 6. Tech Stack

### 6.1 Backend

| Category | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | ^20.19.0 \|\| >=22.12.0 |
| **Framework** | NestJS | ^11.0.1 |
| **Language** | TypeScript | ^5.7.3 |
| **ORM** | Prisma | ^7.7.0 |
| **Database** | PostgreSQL | 16 (docker image: `postgres:16-alpine`) |
| **Database adapter** | @prisma/adapter-pg (pg ^8.14.1) | ^7.7.0 |
| **Authentication** | Passport.js + passport-jwt | ^0.7.0 / ^4.0.1 |
| **JWT** | @nestjs/jwt | ^11.0.2 |
| **Password hashing** | bcrypt (worker-thread offload) | ^6.0.0 |
| **Queue** | BullMQ | ^5.76.4 |
| **Redis client** | ioredis | ^5.10.1 |
| **Task scheduling** | @nestjs/schedule | ^5.0.1 |
| **Events** | @nestjs/event-emitter (EventEmitter2) | ^3.1.0 |
| **HTTP throttling** | @nestjs/throttler | ^6.5.0 |
| **File uploads** | Multer | ^2.1.1 |
| **PDF generation** | PDFKit | ^0.18.0 |
| **Excel export** | ExcelJS | ^4.4.0 |
| **HTTP client** | Axios | ^1.15.2 |
| **Observability** | OpenTelemetry (auto-instrumentation + OTLP HTTP) | ^0.74.0 / ^0.216.0 |
| **Error tracking** | Sentry (@sentry/node) | ^10.49.0 |
| **Metrics** | prom-client (Prometheus) | ^15.1.3 |
| **Security** | Helmet | ^8.1.0 |
| **Secrets** | AWS Secrets Manager SDK | ^3.1040.0 |
| **Serving SPA** | @nestjs/serve-static | ^5.0.5 |
| **Health checks** | @nestjs/terminus | ^11.1.1 |
| **Swagger** | @nestjs/swagger | ^11.2.7 |
| **Validation** | class-validator + class-transformer | ^0.15.1 / ^0.5.1 |
| **Dotenv** | dotenv | ^17.4.2 |
| **Test framework** | Jest + ts-jest | ^30.0.0 / ^29.2.5 |
| **Scripting** | tsx | ^4.21.0 |
| **Containerisation** | Docker + docker-compose | (postgres:16-alpine) |

---

### 6.2 Frontend

| Category | Technology | Version |
|---|---|---|
| **Framework** | React | ^19.2.4 |
| **Build tool** | Vite | ^8.0.4 |
| **Language** | TypeScript | ~6.0.2 |
| **Routing** | React Router DOM | ^7.14.1 |
| **Styling** | TailwindCSS | ^4.2.2 |
| **UI components** | shadcn/ui (Radix-based via @base-ui/react) | ^1.4.0 |
| **Icons** | lucide-react | ^1.8.0 |
| **Toast notifications** | Sonner | ^2.0.7 |
| **Internationalisation** | i18next + react-i18next | ^26.0.4 / ^17.0.2 |
| **Offline/IndexedDB** | Dexie | ^4.4.2 |
| **Maps** | Leaflet | ^1.9.4 |
| **QR code** | qrcode.react | ^4.2.0 |
| **Barcode** | react-barcode | ^1.6.1 |
| **PDF rendering** | pdfjs-dist | ^4.8.69 |
| **Fonts** | Geist Variable | ^5.2.8 |
| **Error tracking** | @sentry/react | ^10.49.0 |
| **Test framework** | Vitest + @testing-library/react | ^3.2.4 / ^16.3.2 |
| **CSS utilities** | clsx + tailwind-merge + tw-animate-css | ^2.1.1 / ^3.5.0 |

---

### 6.3 Infrastructure & DevOps

| Component | Detail |
|---|---|
| **Container** | Docker (`postgres:16-alpine` in `docker-compose.yml`) |
| **Database volume** | Named volume `safari_erp_pgdata` |
| **Migrations** | Prisma Migrate (auto-deploy on startup: `prisma migrate deploy`) |
| **Seed** | `tsx prisma/seed.ts` — creates OWNER account and chart of accounts |
| **Payment gateway** | UPayments (Kuwait) — hosted checkout, S2S inquiry, webhook callback |
| **WhatsApp channel** | MOATMT API (`MOATMT_*` env vars) or custom webhook (`CUSTOMER_NOTIFY_WEBHOOK_URL`) |
| **Secrets management** | AWS Secrets Manager (optional; `SecretsModule`) |
| **Observability** | OTLP HTTP export (configurable endpoint), Sentry DSN, Prometheus `/metrics` |
| **API documentation** | Swagger UI at `/docs` |
| **Static files** | `/uploads` (receipts, handover photos) served via Express static |
| **Environment** | `.env` file; key vars: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `UPAYMENTS_*`, `MOATMT_*`, `SENTRY_DSN`, `PUBLIC_WEB_APP_URL` |

---

*End of SYSTEM_ARCHITECTURE.md*
