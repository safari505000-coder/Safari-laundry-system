# Safari Omni — V25 Full System Architectural Audit Report
**Generated:** 2026-05-12 | **Scope:** All of `src/` (backend) + `web/src/` (frontend)

---

## Executive Summary

The V25 banking core is **substantially sound**. The double-entry journal (`DoubleEntryJournalService` / `GeneralLedgerService`) is consistently wired into every high-value money movement. The main remaining risks are:

1. **`updateOrder` completion path** — settles wallet but doesn't emit `POS_SALE_COMPLETED` to the GL (unlike `posCheckout`).
2. **`invoice-audit` subscription-wallet branch** — mutates `wallet.balance` without a paired journal entry.
3. **`monthly-summary-page.tsx` PayrollTab** — last CRITICAL frontend math leak (recomputes payroll net locally from component fields).

Everything else is either aligned, intentionally exempt, or a low-risk operational satellite.

---

## PART 1 — THE BANKING CORE (V25 CANONICAL LAYER)

### 1.1 Services that write to the General Ledger

| Service | GL / CL Method Called |
|---------|----------------------|
| `CustomerLedgerService` | `generalLedger.append` (13+ call sites) — owns all double-entry writes |
| `PaymentsService` | `generalLedger.append(POS_SALE_COMPLETED)` × 2 paths |
| `OrdersService` | `generalLedger.append(POS_SALE_COMPLETED)` on `posCheckout` only |
| `ExpensesService` | `generalLedger.append(EXPENSE_*)` |
| `DepositsService` | `generalLedger.append(WALLET_SETTLEMENT)` on APPROVED |
| `BankDepositsService` | `generalLedger.append(WALLET_SETTLEMENT)` on verification |
| `ManagerCustodyService` | `generalLedger.append(WALLET_SETTLEMENT)` on verifyCustody |
| `InvoiceAuditService` | `generalLedger.append(*)` via `journal.*Safe` helpers |
| `DebtTransfersService` | `generalLedger.append(DEBT_ADJUSTMENT)` pair on finalize |

### 1.2 Services that write to CustomerLedgerService

| Consumer | Methods Used |
|----------|-------------|
| `PaymentsService` | `applyOrderWalletSettlementForCompletedOrder`, `recordDebtInvoiceCollectedAtCallCenter` |
| `OrdersService` | `applyOrderWalletSettlementForCompletedOrder` (posCheckout + updateOrder) |
| `CallCenterService` | `activateSubscriptionPlan`, `runPrepaidAutoReconcileForCustomer`, `cancelSubscriptionForCustomer`, `recordPartialDebtPayment` |
| `PrepaidAutoReconcileCron` | `runPrepaidAutoReconcileForCustomer` (scheduled) |

### 1.3 Verified Money-Movement Flows

| Flow | GL Entry | CL Service | `$transaction` | Status |
|------|----------|-----------|----------------|--------|
| POS Checkout → instant COMPLETED | ✅ `POS_SALE_COMPLETED` | ✅ `applyOrderWalletSettlement` | ✅ | **ALIGNED** |
| Gateway callback finalize | ✅ `POS_SALE_COMPLETED` | ✅ `applyOrderWalletSettlement` | ✅ | **ALIGNED** |
| CC Manual mark-paid | ✅ `POS_SALE_COMPLETED` | ✅ `applyOrderWalletSettlement` | ✅ | **ALIGNED** |
| Subscription activation (V25 Deposit-then-Settle) | ✅ `WALLET_FUNDING` + legacy `POS_SALE_COMPLETED` | ✅ `activateSubscriptionPlan` | ✅ | **ALIGNED** |
| Subscription cancellation | ✅ `DEBT_ADJUSTMENT` | ✅ `cancelSubscriptionForCustomer` | ✅ | **ALIGNED** |
| CC partial debt payment | ✅ (inside `recordPartialDebtPayment`) | ✅ | ✅ | **ALIGNED** |
| Driver deposit approval | ✅ `WALLET_SETTLEMENT` | ❌ (by design — custody only) | ✅ | **ALIGNED** |
| Bank deposit verification | ✅ `WALLET_SETTLEMENT` | ❌ (by design) | ✅ | **ALIGNED** |
| Manager custody verification | ✅ `WALLET_SETTLEMENT` | ❌ (by design) | ✅ | **ALIGNED** |
| Expense creation | ✅ `EXPENSE_*` | ❌ (not customer-linked) | ✅ | **ALIGNED** |
| Debt transfer finalize | ✅ `DEBT_ADJUSTMENT` pair | ❌ (driver-level, not AR) | ✅ | **ALIGNED** |
| Invoice supervisor edit | ✅ (via journal helpers) | ❌ (private helpers, not CL façade) | ✅ | ⚠️ SEE VULNERABILITIES |
| Driver→Branch cash handover (cashStatus flip) | ❌ | ❌ | ✅ | ✅ INTENTIONAL (state only, no AR change) |
| Order creation (PENDING) | ❌ | ❌ | ✅ | ✅ CORRECT (no revenue to recognise yet) |
| Subscription extend (expiry only) | ❌ | ❌ | ✅ | ✅ CORRECT (not balance/debt) |

### 1.4 Vulnerabilities (Gaps in Banking Core Coverage)

#### 🔴 HIGH — `orders.service.ts → updateOrder` completion path

```
File:  src/orders/orders.service.ts  (function updateOrder)
Risk:  Order transitions to COMPLETED via driver/manager status update.
       customerLedger.applyOrderWalletSettlementForCompletedOrder IS called,
       but generalLedger.append(POS_SALE_COMPLETED) is NOT.
       → Revenue on GL can diverge from posCheckout and PaymentsService paths.
Action: Add generalLedger.append(POS_SALE_COMPLETED) inside the $transaction
        when transitioning to COMPLETED, mirroring the posCheckout pattern.
```

#### 🟡 MEDIUM — `invoice-audit.service.ts → applyWalletForOrder` (SUBSCRIPTION_WALLET branch)

```
File:  src/invoice-audit/invoice-audit.service.ts
Risk:  When supervisor re-applies a SUBSCRIPTION_WALLET order,
       wallet.balance is updated but no journal entry is written for
       that specific branch (unlike DEBT_ON_ACCOUNT which creates a
       debtLedgerEntry). The GL gets the outer audit entry but the
       WALLET_LIABILITY balance is not mirrored.
Action: Add journal.appendWalletAbsorptionEntry for the balance mutation
        inside the SUBSCRIPTION_WALLET re-apply branch.
```

#### 🟢 LOW / INFORMATIONAL (No Action Required)

```
• cash.service.ts driver handover — PAID_TO_DRIVER → HANDED_OVER_TO_OFFICE
  is a custodial state flip; AR/wallet untouched. Subsequent custody/bank
  flows post the GL marker. CORRECT BY DESIGN.

• call-center.service.ts extendSubscription — mutates subscriptionExpiresAt
  only (not balance/debt). CORRECT BY DESIGN.

• call-center.service.ts sendSubscriberReminder — reminder counters only.
  CORRECT BY DESIGN.
```

---

## PART 2 — SATELLITE FEATURES (Owner-Defined, Protected)

These modules are NOT in the Double-Entry Ledger write path. They may **read** financial data for analytics/reporting. They must remain intact.

### 2.1 Infrastructure / Platform

| Module | Purpose |
|--------|---------|
| `SecretsModule` | Env-backed secrets provider |
| `ThrottlerModule` | Rate limiting on sensitive routes |
| `HealthModule` + `ReadinessService` | Liveness / readiness probes |
| `PrismaModule` | Shared DB access layer |
| `AuditLogsModule` | Business + request audit trail |
| `AuthModule` / `PermissionsModule` | JWT / RBAC |
| `DomainEventsModule` | In-process event bus (triggers snapshot refresh) |
| `QueueAdminModule` | DLQ replay for Discord + WhatsApp queues |
| `WalletsModule` | Placeholder shell (currently empty) |

### 2.2 Operational Tools (Run the Business)

| Module | Purpose |
|--------|---------|
| `DispatchModule` | Call-center dispatch lifecycle, SLA monitor, SSE streams |
| `PresenceModule` | Real-time "who is viewing" heartbeats |
| `CustomerNotificationsModule` | WhatsApp queue workers + message builders |
| `CollectionsWorkflowModule` | In-memory CALLBACK/PROMISE/ESCALATION items |
| `AttendanceModule` | Check-in/out, biometric logs, cron |
| `LeavesModule` | Leave request workflows |
| `PayrollModule` | Payroll rows, net pay, commissions, loan, holds |
| `LoansModule` | Employee loan lifecycle |
| `CommissionsModule` | Commission accrual feeding payroll |
| `DebtHoldsModule` | Payroll-period debt holds |
| `VehicleExpensesModule` | Fleet expense tracking |
| `InventoryModule` / `PurchaseOrdersModule` | Stock movements, purchase orders |
| `LaundryPriceListModule` | Master + branch laundry price catalog |
| `PosModule` | POS helper services (wallet snapshots, ledger tx enums) |
| `DriverOversightModule` | Manager branch driver cards (shifts, stale flags) |
| `StaleQuickOrdersCron` | Daily watchdog for dangling quick-capture invoices |
| `SerialCounterService` | Driver/manager invoice serial prefix assignment |
| `SubscriptionPlansModule` / `SubscribersModule` | Subscription catalog & subscriber directory |
| `BranchesModule` / `UsersModule` | Org, RBAC, branches |
| `ShiftsModule` | Shift cycle management |
| `ManagerDocumentsModule` | Document workflows for managers |
| `FeedbackModule` | Customer feedback/ratings |
| `VerifyModule` | Identity verification utilities |
| `SystemModule` / `SystemConfigModule` / `SystemSettingsModule` | System settings & config |

### 2.3 Reporting & Analytics Tools

| Module | Purpose |
|--------|---------|
| `CollectionsIntelligenceModule` | Collections prioritisation scores (0–100) |
| `RiskScoringService` | Customer risk scores from aging/promises/exposure |
| `FinancialObservabilityService` | Reconciliation / fraud / snapshot health score |
| `FinancialSnapshotService` | `FinancialSnapshot` projection table |
| `DebtVisibilityService` | Canonical "what number does the UI show" façade |
| `FinancialTimelineService` | Unified merged timeline feed |
| `SalesDebtAnalyticsModule` | Sales vs collected aggregations |
| `OutstandingModule` | Outstanding AR listings / helpers |
| `ReadModelsModule` | Precomputed KPI snapshots for dashboards |
| `AccountingModule` | Branch/driver cash reconciliation views |
| `ReportsModule` | Consolidated institutional reports |
| `ExportsModule` | Excel/PDF streaming export wrappers |

### 2.4 Owner-Custom Features

| Module | Purpose |
|--------|---------|
| `CashIntelligenceModule` | Read-only cash anomaly classifier (no mutations) |
| `CashMonitorModule` | Live advisory layer over cash intelligence |
| `SystemGuardianModule` | Periodic watchdog — WhatsApp alerts to owner |
| `FraudDetectionService` | Scheduled anomaly scans → FraudAlert rows |
| `InsightsModule` | Lightweight forecasting / anomaly BI |
| `OwnerDashboardModule` | Aggregate dashboard + Redis cache + queue depth |
| `SafariStreamModule` | Role-scoped bootstrap snapshot (permissions, wallet hints) |
| `ObservabilityModule` | Metrics, timing interceptor, Discord alerts |
| `DiscordAlertsModule` | BullMQ Discord worker with dedup + circuit breaker |
| `PaymentMethodFeesModule` | Fee config for payment methods |

### 2.5 Frontend Satellite Features

| Feature | Classification |
|---------|---------------|
| `whatsapp-links.ts` — Arabic WhatsApp templates | OPERATIONAL_TOOL |
| `use-price-list.ts` — POS price catalog offline cache | OPERATIONAL_TOOL |
| `workflow-intelligence.ts` — date/bucket classifier | OPERATIONAL_TOOL |
| Risk/Fraud/Aging badges — display of backend signals | REPORTING_TOOL |
| Print pages (payroll, expense voucher, reports) | REPORTING_TOOL |
| DriverPOS / POS shell components | OPERATIONAL_TOOL |

---

## PART 3 — REFINEMENT & CLEANUP

### 3.1 Critical Math Leaks (Remaining)

#### 🔴 CRITICAL — `monthly-summary-page.tsx` PayrollTab

```
File:  web/src/pages/monthly-summary-page.tsx  (~738–815)
Issue: PayrollTab recomputes payroll net as basicSalary + allowances − deductions
       locally from string fields, ignoring server-computed netSalaryKd.
Fix:   Replace local computation with sumKwdStrings(rows.map(r => r.netSalaryKd))
       for totals and r.netSalaryKd for per-row display.
```

#### 🔴 CRITICAL — `use-pos-engine.ts` cart subtotals

```
File:  web/src/modules/shared/hooks/use-pos-engine.ts
Issue: Repeated parseFloat + reduce on price strings for cart/billing preview.
Note:  This is the POS checkout engine; amounts are used to BUILD the request
       payload sent to the backend (not to display settled amounts).
       A @V24-LEGACY-MATH-EXEMPTION comment is required but absent.
Fix:   Add @V24-LEGACY-MATH-EXEMPTION comment citing "POS pre-submission preview only".
```

#### 🔴 CRITICAL — `KnetAudit.tsx` local reduction

```
File:  web/src/modules/accountant/pages/KnetAudit.tsx  (~182–245)
Issue: reduce + Number.parseFloat on price strings for KPI display totals.
Fix:   Backend should return server-computed KPI totals in the API response.
       Frontend reads and displays those totals directly.
```

#### 🔴 CRITICAL — `invoice-supervisor-actions.tsx` and `create-order-dialog.tsx`

```
Files: web/src/modules/shared/components/orders/invoice-supervisor-actions.tsx
       web/src/modules/shared/components/orders/create-order-dialog.tsx
Issue: qty * unitPrice via parseFloat for line-total display / request building.
Note:  Likely pre-submission preview (like POS engine).
Fix:   Add @V24-LEGACY-MATH-EXEMPTION comment where preview-only,
       or consume lineTotalKd from the backend DTO if it exists.
```

#### 🟡 WARNING — `payroll-unified-page.tsx` edit buffers

```
File:  web/src/pages/payroll-unified-page.tsx
Issue: Many Number.parseFloat calls on form edit buffers and local totals.
       payrollNet() now delegates to row.netSalaryKd (patched V25),
       but intermediate totals still use f() which parses server strings.
Fix:   Keep f() for edit-buffer validation;
       for aggregated totals, prefer sumKwdStrings(rows.map(r => r.netSalaryKd)).
```

#### 🟡 WARNING — `payments.controller.ts` `toFixed(3)` serialization

```
File:  src/payments/payments.controller.ts (~778, ~904, ~954, ~1033)
Issue: amountKd: order.totalPrice.toFixed(3) inline in controller response shaping.
Note:  This is serialization-only (no arithmetic), but it bypasses the canonical
       formatKwdString helper and couples the controller to money formatting.
Fix:   Move toFixed(3) serialization into PaymentsService response DTOs.
```

### 3.2 Missing Ledger Links (Remaining Gaps)

#### 🔴 CRITICAL — `orders.service.ts updateOrder` — No `POS_SALE_COMPLETED`

```
File:  src/orders/orders.service.ts  (updateOrder, ~3040–3090)
Gap:   When any actor (driver, manager) transitions an order to COMPLETED via
       updateOrder, customerLedger.applyOrderWalletSettlementForCompletedOrder
       is called but generalLedger.append(POS_SALE_COMPLETED) is NOT.
       posCheckout and PaymentsService finalize BOTH emit POS_SALE_COMPLETED.
       This means revenue from driver-completed orders is missing from the
       Unified Ledger / Executive P&L.
Fix:   Add generalLedger.append(GeneralLedgerEntryType.POS_SALE_COMPLETED, ...)
       inside the existing $transaction when dto.status === COMPLETED.
```

#### 🟡 WARNING — `invoice-audit.service.ts` SUBSCRIPTION_WALLET re-apply

```
File:  src/invoice-audit/invoice-audit.service.ts (applyWalletForOrder)
Gap:   SUBSCRIPTION_WALLET branch updates wallet.balance but does not call
       journal.appendWalletAbsorptionEntry. The WALLET_LIABILITY (2100) account
       is not mirrored for this specific sub-path.
Fix:   Add journal.appendWalletAbsorptionEntrySafe inside the SUBSCRIPTION_WALLET
       branch of applyWalletForOrder, mirroring the pattern used in
       CustomerLedgerService.applyOrderWalletSettlementForCompletedOrder.
```

---

## System Health Dashboard

```
╔══════════════════════════════════════════════════════════════════════════╗
║             SAFARI OMNI — V25 BANKING CORE HEALTH SCORECARD              ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CORE FLOWS                                                              ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  POS checkout (instant)         ✅  GL + CL + $tx — FULLY ALIGNED        ║
║  Gateway callback finalize      ✅  GL + CL + $tx — FULLY ALIGNED        ║
║  CC manual mark-paid            ✅  GL + CL + $tx — FULLY ALIGNED        ║
║  Subscription activation (V25)  ✅  GL + CL + $tx — ALIGNED (V25 model)  ║
║  Subscription cancellation      ✅  GL + CL + $tx — FULLY ALIGNED        ║
║  CC partial debt payment        ✅  GL + CL + $tx — FULLY ALIGNED        ║
║  Driver deposit approval        ✅  GL + $tx — ALIGNED (no AR)           ║
║  Bank deposit verification      ✅  GL + $tx — ALIGNED                   ║
║  Manager custody verification   ✅  GL + $tx — FULLY ALIGNED             ║
║  Expense creation               ✅  GL + $tx — ALIGNED                   ║
║  Debt transfer finalize         ✅  GL + $tx — ALIGNED                   ║
║                                                                          ║
║  GAPS (Require Action)                                                   ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  updateOrder → COMPLETED        🔴  CL only, NO GL POS_SALE_COMPLETED    ║
║  invoice-audit SUBSCR_WALLET    🟡  wallet.balance, NO WALLET_LIABILITY   ║
║                                                                          ║
║  FRONTEND MATH PURITY                                                    ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  payroll-page.tsx               ✅  Uses row.netSalaryKd (V25 patched)   ║
║  payroll-unified-page.tsx       ✅  Uses row.netSalaryKd (V25 patched)   ║
║  monthly-summary-page.tsx       🔴  Still computes b+a−d locally         ║
║  use-pos-engine.ts              🟡  Preview-only (needs exemption tag)   ║
║  KnetAudit.tsx                  🔴  Local reduce — backend total needed  ║
║  collections-report-page.tsx   ✅  Exemption documented                  ║
║  debt-transfers-page.tsx        ✅  Exemption documented (V21 Phase 5)   ║
║                                                                          ║
║  CONTROLLER MATH PURITY                                                  ║
║  ──────────────────────────────────────────────────────────────────────  ║
║  All deposit controllers        ✅  parseFloat removed (V25 purge)       ║
║  payments.controller.ts         ✅  parseKwdMinor removed (V25 purge)    ║
║  payment-method-fees.ctrl       ✅  Prisma.Decimal moved to service       ║
║  payment-method-fees.svc        ✅  patchConfig() added (V25 purge)      ║
║  payments.controller.ts         🟡  toFixed(3) still inline (WARNING)   ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Recommended Next Steps (Priority Order)

| Priority | Action |
|----------|--------|
| 🔴 P1 | Fix `orders.service.ts updateOrder` — add `generalLedger.append(POS_SALE_COMPLETED)` when completing via driver/staff path |
| 🔴 P2 | Fix `monthly-summary-page.tsx` PayrollTab — use `netSalaryKd` from server instead of local `b+a−d` |
| 🔴 P3 | Fix `KnetAudit.tsx` — move aggregation to backend, return canonical total in API response |
| 🟡 P4 | Fix `invoice-audit.service.ts` SUBSCRIPTION_WALLET branch — add `journal.appendWalletAbsorptionEntrySafe` |
| 🟡 P5 | Tag `use-pos-engine.ts` with `@V24-LEGACY-MATH-EXEMPTION` (pre-submission preview, not display of settled amounts) |
| 🟡 P6 | Tag `invoice-supervisor-actions.tsx` + `create-order-dialog.tsx` appropriately (preview) or consume `lineTotalKd` from server |
| 🟢 P7 | Move `totalPrice.toFixed(3)` from `payments.controller.ts` response bodies into a DTO mapper in `PaymentsService` |

---

*Report generated from V25 Architecture Audit — Safari Omni ERP. All "Owner-Defined Features" listed in Part 2 are protected and must not be altered without explicit owner instruction.*
