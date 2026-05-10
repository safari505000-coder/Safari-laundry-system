# Safari ERP — Safe Development Financial Reset Report

**Generated:** 2026-05-07T21:04:49.814Z
**Mode:** apply
**DB host:** metro.proxy.rlwy.net

## Scope

- Preserved: schema, migrations, users, branches, settings, services/products, permissions, frontend architecture, modules, APIs, business logic, customer master records, SubscriptionPlan definitions, Account chart.
- Cleared/reset: invoices/orders, payment bundles, debt ledger, customer transaction history, journal entries/lines, wallet absorption history, subscription instances, collections state, financial events/outbox, cached financial projections/snapshots, cash custody/deposit financial rows.
- AuditLog is preserved; this markdown report is the reset audit artifact.

## Counts

| Table / operation | Before | After | Reason |
|---|---:|---:|---|
| `DebtTransferOrder` | 0 | 0 | order-linked debt transfer line items |
| `CommissionPayout` | 0 | 0 | order/debt-entry derived commission accruals |
| `InvoiceAuditLog` | 0 | 0 | invoice edit/void transactional audit |
| `OrderFeedback` | 0 | 0 | invoice receipt feedback tied to orders |
| `OrderLineItem` | 0 | 0 | invoice/order line items |
| `PromiseEvent` | 0 | 0 | collections promise transition history |
| `PromiseToPay` | 0 | 0 | collections promise state |
| `CollectionsStageEvent` | 0 | 0 | collections lifecycle transition history |
| `CollectionsAccount` | 0 | 0 | collections lifecycle account state |
| `CustomerCollectionStatus` | 0 | 0 | legacy AR collections status rows |
| `FraudAlert` | 0 | 0 | financial fraud/risk alerts derived from transactions |
| `FinancialPeriodViolation` | 0 | 0 | period-lock financial write violation audit |
| `FinancialPeriod` | 0 | 0 | financial close period state |
| `TransactionHistory` | 0 | 0 | customer ledger / subscription consumption history |
| `DebtLedgerEntry` | 0 | 0 | debt ledger, payments, wallet absorption history |
| `JournalFailureLog` | 0 | 0 | journal mirror failure queue/log |
| `JournalLine` | 0 | 0 | double-entry journal lines |
| `JournalEntry` | 0 | 0 | double-entry journal entries |
| `GeneralLedgerEntry` | 0 | 0 | company-side GL projection rows |
| `FinancialEventDelivery` | 0 | 0 | idempotent financial event consumer log |
| `FinancialEventOutbox` | 0 | 0 | financial outbox/domain events |
| `FinancialKpiSnapshot` | 4 | 0 | cached financial KPI projections |
| `FinancialSnapshot` | 9 | 9 | cached customer financial projections |
| `BankDepositLog` | 0 | 0 | bank deposit reconciliation results |
| `ManagerCashCustody` | 0 | 0 | cash custody transactional bags |
| `Deposit` | 0 | 0 | driver deposit transactional rows |
| `DebtHold` | 0 | 0 | financial debt-hold rows |
| `Shift` | 13 | 0 | cash handover shifts |
| `PosPaymentBundle` | 0 | 0 | multi-invoice payment bundles |
| `CustomerSubscription` | 0 | 0 | customer subscription instances/consumption history |
| `Dispatch` | 0 | 0 | call-center dispatches closed by orders |
| `DriverMetrics` | 0 | 0 | dispatch/order-derived driver counters |
| `DebtTransfer` | 0 | 0 | debt transfer documents |
| `Order` | 0 | 0 | invoices/orders |
| `CustomerWallet (zeroed, rows preserved)` | 9 | 0 | wallet balances/debts and subscription runtime fields reset to zero/null |
| `SerialCounter ORDER_SERIAL / OU_% (reset)` | 1 | 1 | invoice numbering high-water marks reset |

## Post-Reset Validation

| Check | Status | Detail |
|---|---|---|
| DebtTransferOrder cleared | PASS | 0 row(s) remaining |
| CommissionPayout cleared | PASS | 0 row(s) remaining |
| InvoiceAuditLog cleared | PASS | 0 row(s) remaining |
| OrderFeedback cleared | PASS | 0 row(s) remaining |
| OrderLineItem cleared | PASS | 0 row(s) remaining |
| PromiseEvent cleared | PASS | 0 row(s) remaining |
| PromiseToPay cleared | PASS | 0 row(s) remaining |
| CollectionsStageEvent cleared | PASS | 0 row(s) remaining |
| CollectionsAccount cleared | PASS | 0 row(s) remaining |
| CustomerCollectionStatus cleared | PASS | 0 row(s) remaining |
| FraudAlert cleared | PASS | 0 row(s) remaining |
| FinancialPeriodViolation cleared | PASS | 0 row(s) remaining |
| FinancialPeriod cleared | PASS | 0 row(s) remaining |
| TransactionHistory cleared | PASS | 0 row(s) remaining |
| DebtLedgerEntry cleared | PASS | 0 row(s) remaining |
| JournalFailureLog cleared | PASS | 0 row(s) remaining |
| JournalLine cleared | PASS | 0 row(s) remaining |
| JournalEntry cleared | PASS | 0 row(s) remaining |
| GeneralLedgerEntry cleared | PASS | 0 row(s) remaining |
| FinancialEventDelivery cleared | PASS | 0 row(s) remaining |
| FinancialEventOutbox cleared | PASS | 0 row(s) remaining |
| BankDepositLog cleared | PASS | 0 row(s) remaining |
| ManagerCashCustody cleared | PASS | 0 row(s) remaining |
| Deposit cleared | PASS | 0 row(s) remaining |
| DebtHold cleared | PASS | 0 row(s) remaining |
| PosPaymentBundle cleared | PASS | 0 row(s) remaining |
| CustomerSubscription cleared | PASS | 0 row(s) remaining |
| Dispatch cleared | PASS | 0 row(s) remaining |
| DriverMetrics cleared | PASS | 0 row(s) remaining |
| DebtTransfer cleared | PASS | 0 row(s) remaining |
| Order cleared | PASS | 0 row(s) remaining |
| CustomerWallet runtime balances cleared | PASS | 0 wallet row(s) still carry financial runtime state |
| financial customer blocks cleared | PASS | 0 customer row(s) still blocked |
| invoice serial counters reset | PASS | 0 stale invoice serial counter row(s) |
| FinancialSnapshot rebuilt clean | PASS | 0 stale snapshot row(s) |
| FinancialKpiSnapshot projection cache rebuilt/empty | PASS | 0 rebuildable KPI cache row(s) present after reset |
| Shift rows carry no financial links | PASS | 0 financially-linked shift row(s), 0 runtime shift row(s) total |
| journal cleared (therefore no imbalance) | PASS | 0 journal entry row(s) remaining |
| ledger/journal corruption impossible after clear | PASS | DebtLedgerEntry=0, JournalEntry=0 |

