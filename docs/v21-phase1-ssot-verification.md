# V21 — PHASE 1 — SINGLE SOURCE OF FINANCIAL TRUTH (SSoT) VERIFICATION

> Per-surface read-path trace for the 6 financial surfaces named
> in the Phase 1 mission. Each surface is verified to consume
> canonical projections only — no duplicated balance calculation.

## 1 — Customer360

**Surface**: `GET /api/customers/:id/360`
**Controller**: `src/customers/customers.controller.ts`
**Service**: `src/customers/customer-360.service.ts`

```ts
// src/customers/customer-360.service.ts:13
import { computeCustomer360FinancialCore } from './customer-360-financials';

// src/customers/customer-360.service.ts:68
const financials = await computeCustomer360FinancialCore(...)
```

Single canonical aggregator. Tested in `customer-360-financials.spec.ts`
+ `customer-360.service.spec.ts` + `sanitize-customer-360-view.spec.ts` +
`v20-8-1-financial-breakdown.spec.ts`.

**Verdict**: ✅ Canonical, no duplicate balance calculation.

## 2 — Outstanding

**Surface**: `GET /api/finance/outstanding`
**Service**: `src/finance/outstanding/outstanding.service.ts`

```ts
// src/finance/outstanding/outstanding.service.ts:23
import {...} from '../debt-customer-aggregates.util';
```

The `debt-customer-aggregates.util` is the canonical aggregator
for customer-level debt totals (sum of open invoice remaining
balances). The Outstanding service reads `Customer`, `User`,
`CustomerCollectionStatus` for metadata, and consumes the
canonical aggregator for money. Aggregation happens in **one
place only**.

**Verdict**: ✅ Canonical.

## 3 — Aging

**Surface**: `GET /api/finance/aging`
**Service**: `src/finance/aging/aging.service.ts`

```ts
// src/finance/aging/aging.service.ts:7
import {...} from '../debt-customer-aggregates.util';
```

Same canonical aggregator as Outstanding. Aging additionally
buckets per `Order` row by age, but the **money values** all
come from the canonical aggregator.

**Verdict**: ✅ Canonical.

## 4 — Collections

**Surface**: multiple — `/api/finance/collections/*`
**Service**: `src/finance/collections/collections-workflow.service.ts`

```ts
// src/finance/collections/collections-workflow.service.ts:405
return this.prisma.collectionsAccount.findMany({...});
```

`CollectionsAccount` is the canonical projection table for
collections-stage state per customer. The workflow service does
not re-aggregate debt — it consumes the projection.

**Verdict**: ✅ Canonical.

## 5 — FinancialTimeline

**Surface**: `GET /api/finance/timeline/:customerId`
**Service**: `src/finance/timeline/financial-timeline.service.ts`

The timeline reads from 7 source tables in append-only mode:

```ts
// src/finance/timeline/financial-timeline.service.ts
:159  this.prisma.order.findMany({...})           // invoices
:194  this.prisma.debtLedgerEntry.findMany({...}) // debt audit trail
:248  this.prisma.customerSubscription.findMany({...}) // subscription events
:303  this.prisma.generalLedgerEntry.findMany({...}) // legacy GL mirror (V22 retirement)
:348  this.prisma.promiseEvent.findMany({...})    // collections promises
:408  this.prisma.collectionsStageEvent.findMany({...}) // stage transitions
:452  this.prisma.journalEntry.findMany({...})    // canonical journal
```

Each read is **scoped to a single source-of-truth per concept**:
- Orders → invoice issuance (canonical)
- DebtLedgerEntry → debt deltas (canonical, append-only)
- JournalEntry → ledger lines (canonical, append-only)
- CustomerSubscription → subscription state (canonical)
- PromiseEvent / CollectionsStageEvent → collections state (canonical)
- GeneralLedgerEntry → **legacy mirror**, retirement plan documented in
  `docs/v21-gl-retirement-report.md`. Currently a parallel read alongside
  the canonical `JournalEntry` for backward-compatibility with V19-era
  views; the V22 plan is to migrate consumers to JournalEntry-only and
  freeze writes via env flag.

There is **no aggregation in the timeline service** — every row
projected to the UI carries its own money value from the
source-of-truth row. No duplicated balance calculation.

**Verdict**: ✅ Canonical (with documented legacy GL mirror, V22
retirement plan in place).

## 6 — Reports

**Surface**: `/api/reports/*`
**Service**: `src/reports/reports.service.ts`

The reports service reads transactional rows (e.g., `Order`,
`Expense`, `FixedExpense`) and computes totals using the canonical
Decimal helpers:

```ts
// src/reports/reports.service.ts:34
import {
  minorToAmountString,
  sumOrderMinors,
} from '../finance/finance-money';

// src/reports/reports.service.ts:168
const totalKd = minorToAmountString(
  sumOrderMinors(rows.map((r) => ({ totalPrice: r.totalPrice }))),
);
```

The aggregation goes through `sumOrderMinors` (a canonical
integer-minor-units sum) → `minorToAmountString` (canonical
formatter). The frontend never re-aggregates — it renders
`totals.totalKd` directly. Per the inline V21 Phase 5 comment:

> `totals` is computed in Decimal precision on the server so the
> UI never re-aggregates `totalPrice` strings via `parseFloat`.

**Verdict**: ✅ Canonical.

## 7 — Summary

| Surface             | Canonical reader                           | Aggregator      | Verdict |
|---------------------|--------------------------------------------|-----------------|---------|
| Customer360         | `computeCustomer360FinancialCore`          | Single          | ✅ |
| Outstanding         | `debt-customer-aggregates.util`            | Single          | ✅ |
| Aging               | `debt-customer-aggregates.util`            | Single          | ✅ |
| Collections         | `collectionsAccount` projection            | None (projection-only) | ✅ |
| FinancialTimeline   | 7 source tables; each row carries its own money | None per service | ✅ (legacy GL mirror documented) |
| Reports             | Prisma → `sumOrderMinors` → `minorToAmountString` | Canonical Decimal helper | ✅ |

**Zero duplicated balance calculations were found.**

The single residual technical debt is the parallel read of
`GeneralLedgerEntry` in `FinancialTimeline`. This is a
**display-only** legacy mirror; writes are bounded by the
canonical `appendBalanced`. The V22 retirement plan is
documented in `docs/v21-gl-retirement-report.md`.
