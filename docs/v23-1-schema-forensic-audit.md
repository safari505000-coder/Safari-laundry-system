# Prisma schema forensic audit (v23.1)

> **WARNING — DO NOT DROP DATABASE TABLES.** This audit is for documentation and optional `/// @deprecated` annotations in `schema.prisma` only. Financial models are append-only and protected by triggers; removing or renaming tables is out of scope and dangerous.

## Scope

- **Schema:** `prisma/schema.prisma`
- **Codebase:** `src/`, `prisma/` (seed, verify), `scripts/`, `load-test/scripts/`
- **Search patterns:** Delegates accessed as `prisma.*`, `this.prisma.*`, `tx.*`, `db.*` (Prisma transactional / injected client aliases used in ledger code)
- **Conservative rule:** Anything that could be dynamic `prisma[model]` — not found in TS under this repo (`prisma[` only matched an unrelated regex in a script); no systemic dynamic delegate access detected.

---

## Summary counts

| Metric | Count |
|--------|------:|
| **Total `model` blocks** | **74** |
| **ACTIVE** | **74** |
| **LOW_USAGE** | **0** (under definitions below — no model is confined to tests/seeds only without app wiring) |
| **DEAD_CANDIDATE** | **0** |

### Bucketing definitions (as requested)

- **ACTIVE:** ≥5 Prisma-style calls **or** use from Nest `*.service.ts`, `*.controller.ts`, `*.middleware.ts`, `*.cron.ts`, or bootstrap (`main.ts`), etc.
- **LOW_USAGE:** 1–4 calls **and** mostly tests/seeds/scripts *without* production module wiring — **none** matched after searching `src` + scripts + prisma seed.
- **DEAD_CANDIDATE:** zero delegate usage **and** not referenced via app layering — **none** (and every model below is either used in code **or** is a normal FK relation target in the ERP graph).

---

## Complete model inventory (alphabetical)

Account, AttendanceLog, AuditLog, BackfillAuditLock, BankDepositLog, Branch, BranchExpense, BranchStockLevel, CashIntelExecutionEvent, CollectionsAccount, CollectionsStageEvent, CommissionPayout, CommissionRule, Customer, CustomerCollectionStatus, CustomerSubscription, CustomerWallet, DebtHold, DebtHoldPolicy, DebtLedgerEntry, DebtTransfer, DebtTransferOrder, Deposit, Dispatch, DriverMetrics, EmployeeLoan, FinancialEventDelivery, FinancialEventOutbox, FinancialKpiSnapshot, FinancialPeriod, FinancialPeriodViolation, FinancialSnapshot, FixedExpenseSchedule, FraudAlert, GeneralLedgerEntry, InventoryCategory, InvoiceAuditLog, JournalEntry, JournalFailureLog, JournalLine, LaundryBranchItemPrice, LaundryItemCategory, LaundryPriceListItem, LeaveRequest, ManagerCashCustody, Order, OrderFeedback, OrderLineItem, Payroll, PayrollAdHocLine, PayrollSettings, PaymentMethodFeeConfig, Permission, PosPaymentBundle, PromiseEvent, PromiseToPay, PurchaseOrder, PurchaseOrderLine, PurchaseOrderReceipt, PurchaseOrderReceiptLine, RefreshToken, Role, SerialCounter, Shift, StockItem, StockMovement, Supplier, SystemConfig, SystemToggle, SubscriptionPlan, TransactionHistory, User, VehicleExpense, Wallet.

*(Source: `grep ^model\s+\w+` on `prisma/schema.prisma` — 74 declarations, last model ends file ~3177.)*

---

## DEAD_CANDIDATE detail

**None.** Every model had at least one hit for `prisma` / `this.prisma` / `tx` / `db` delegates (with realistic client variable names used in this repo), spanning production Nest services, cron, middleware, domain-event services, ledger services, bootstrap (`main.ts`), or operational `scripts/` / `prisma/seed.ts`.

### Relation / FK note (double-check)

All Prisma models in this ERP participate in relational graphs (`Order` → lines, journaling, wallets, etc.). Per your rule, **targets of `@relation` are not "dead"** even when write paths are narrow — e.g. `PurchaseOrderReceipt` / `PurchaseOrderReceiptLine` are written inside `purchase-orders.service.ts` (transaction paths) and have migration DDL (e.g. `prisma/migrations/…_purchase_orders/migration.sql`).

### Seeds / migrations

Operational tables universally appear in migrations (representative receipts example above). Seed file `prisma/seed.ts` touches many foundational models (roles, permissions, accounts, fee config, etc.). **No orphaned table** surfaced in this forensic pass.

---

## Recommended `/// @deprecated` additions

**Recommendation: add none.**

Reasoning:

1. **No DEAD_CANDIDATE models** — there is nothing unused at the delegate layer with the search scope and aliases used here.
2. **Low-call ≠ unused** — e.g. `financialEventDelivery` has a thin API (`create`) but backs the financial event bus; `purchaseOrderReceipt*` is part of inbound PO workflows. Marking `@deprecated` would falsely signal safe removal/negligible data.
3. **Financial append-only posture** — schema annotations should reflect *product deprecation*, not "low grep count", to avoid teams misreading intent.

If you later want **product-level** deprecation (feature retired but table retained), annotate only after business confirmation, with a ticket reference in the doc comment.

---

## Methodology caveat

Counts did not exhaustively classify **ACTIVE vs LOW_USAGE by raw call multiplicity** across every delegate; conservative interpretation favors **ACTIVE** whenever any durable Nest module touches the model. Re-run with automated AST counting if you need a quantitative LOW_USAGE ledger.

---

*Generated: forensic read-only audit. No filesystem changes.*
