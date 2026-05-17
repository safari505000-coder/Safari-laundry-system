# Safari ERP — Safe Financial Reset Report

**Generated:** 2026-05-16T01:11:10.058Z
**Mode:** dry-run
**Scope:** full-money
**DB host:** metro.proxy.rlwy.net

## Scope

- Preserved: schema, migrations, users, customers, branches, settings, services/products, permissions, frontend architecture, modules, APIs, business logic, customer master records, SubscriptionPlan definitions, Account chart, catalog/price data, inventory master data, login sessions.
- Cleared/reset: invoices/orders, payment bundles, debt ledger, customer transaction history, journal entries/lines, wallet absorption history, subscription instances, collections state, financial events/outbox, cached financial projections/snapshots, cash custody/deposit financial rows.
- Full-money scope additionally clears payroll runs, manual payroll lines, employee loans, branch expenses, vehicle expenses, fixed expense schedules, branch wallet balances, and salary runtime fields on users.
- AuditLog is preserved; this markdown report is the reset audit artifact.

## Counts

| Table / operation | Before | After | Reason |
|---|---:|---:|---|
| `DebtTransferOrder` | 0 | n/a | order-linked debt transfer line items |
| `CommissionPayout` | 0 | n/a | order/debt-entry derived commission accruals |
| `InvoiceAuditLog` | 0 | n/a | invoice edit/void transactional audit |
| `OrderFeedback` | 0 | n/a | invoice receipt feedback tied to orders |
| `OrderLineItem` | 0 | n/a | invoice/order line items |
| `PromiseEvent` | 0 | n/a | collections promise transition history |
| `PromiseToPay` | 0 | n/a | collections promise state |
| `CollectionsStageEvent` | 0 | n/a | collections lifecycle transition history |
| `CollectionsAccount` | 0 | n/a | collections lifecycle account state |
| `CustomerCollectionStatus` | 0 | n/a | legacy AR collections status rows |
| `FraudAlert` | 0 | n/a | financial fraud/risk alerts derived from transactions |
| `FinancialPeriodViolation` | 0 | n/a | period-lock financial write violation audit |
| `FinancialPeriod` | 0 | n/a | financial close period state |
| `TransactionHistory` | 0 | n/a | customer ledger / subscription consumption history |
| `DebtLedgerEntry` | 0 | n/a | debt ledger, payments, wallet absorption history |
| `JournalFailureLog` | 0 | n/a | journal mirror failure queue/log |
| `JournalLine` | 0 | n/a | double-entry journal lines |
| `JournalEntry` | 0 | n/a | double-entry journal entries |
| `GeneralLedgerEntry` | 0 | n/a | company-side GL projection rows |
| `FinancialEventDelivery` | 0 | n/a | idempotent financial event consumer log |
| `FinancialEventOutbox` | 0 | n/a | financial outbox/domain events |
| `FinancialKpiSnapshot` | 4 | n/a | cached financial KPI projections |
| `FinancialSnapshot` | 0 | n/a | cached customer financial projections |
| `BankDepositLog` | 0 | n/a | bank deposit reconciliation results |
| `ManagerCashCustody` | 0 | n/a | cash custody transactional bags |
| `Deposit` | 0 | n/a | driver deposit transactional rows |
| `DebtHold` | 0 | n/a | financial debt-hold rows |
| `Shift` | 0 | n/a | cash handover shifts |
| `PosPaymentBundle` | 0 | n/a | multi-invoice payment bundles |
| `CustomerSubscription` | 0 | n/a | customer subscription instances/consumption history |
| `Dispatch` | 0 | n/a | call-center dispatches closed by orders |
| `DriverMetrics` | 0 | n/a | dispatch/order-derived driver counters |
| `DebtTransfer` | 0 | n/a | debt transfer documents |
| `Order` | 0 | n/a | invoices/orders |
| `PayrollAdHocLine` | 0 | n/a | manual payroll roster lines |
| `Payroll` | 0 | n/a | payroll runs and payslip financial rows |
| `EmployeeLoan` | 0 | n/a | employee loan balances and installment schedules |
| `BranchExpense` | 0 | n/a | branch cash/operational expense receipts |
| `VehicleExpense` | 0 | n/a | fleet/vehicle expense receipts |
| `FixedExpenseSchedule` | 0 | n/a | fixed monthly expense schedules |
| `CustomerWallet (zeroed, rows preserved)` | 0 | n/a | wallet balances/debts and subscription runtime fields reset to zero/null |
| `SerialCounter ORDER_SERIAL / OU_% (reset)` | 1 | n/a | invoice numbering high-water marks reset |
| `Wallet (branch balances zeroed, rows preserved)` | 0 | n/a | branch petty-cash wallet balances reset to zero |
| `User salary fields (cleared, rows preserved)` | 0 | n/a | basic monthly salary and monthly allowances cleared |

