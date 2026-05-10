# V20.4 — Phase 2 Read-Model Layer (CQRS-lite)

This folder is the **canonical read side** of the financial
platform. All operational screens (Subscribers, Outstanding,
Collections, Customer 360, Dashboards) MUST go through one of
the read models here — never aggregate `JournalLine` /
`DebtLedgerEntry` / `Order` directly.

```
WRITE SIDE (src/customer-ledger/, src/general-ledger/, src/orders/, …)
   │
   ▼
Domain events (src/domain-events/) ─► FinancialSnapshot projector
                                       (src/finance/snapshots/)
                                              │
                                              ▼
                                       FinancialSnapshot table
                                              │
                                              ▼
                              ┌──── DebtVisibilityService ────┐
                              │                                │
              READ MODELS (this folder)         FinancialKpiSnapshot
              ├── collections-read-model              │
              ├── subscriber-read-model               ▼
              ├── outstanding-read-model       Materialized KPI cards
              └── finance-kpi-read-model
                              │
                              ▼
                          UI surfaces
```

## Rules

1. Read models NEVER aggregate `JournalLine` or `DebtLedgerEntry`
   directly — they consume `DebtVisibilityService` or
   `FinancialSnapshot`.
2. Read models NEVER mutate state.
3. Read models are free to add their own caches / Redis layer
   in front; the contract is `(query) → (DTO)`.
4. New screens add a new file here and a new hook in
   `web/src/modules/finance/hooks/`.
5. Backwards compatibility: legacy services
   (`SubscribersService`, `OutstandingService`,
   `DebtService.getCustomerDebtSnapshot`) are being migrated
   to delegate to these read models in V20.4.x.

## Modules

| Module | Owns | Status |
| --- | --- | --- |
| `collections-read-model` | Collections page rows + KPI summary | shipped V20.4 |
| `subscriber-read-model` | Subscribers list + per-row debt chip | shipped V20.4 |
| `outstanding-read-model` | Outstanding payments list + summary | shipped V20.4 |
| `finance-kpi-read-model` | Dashboard tiles backed by `FinancialKpiSnapshot` | shipped V20.4 |

Each module exports a `*ReadModel` injectable. Compose them in
controllers; do NOT share their DTOs across feature modules
(they're read-side projection contracts and may evolve faster
than the financial primaries).
