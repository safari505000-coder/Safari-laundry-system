# Safari ERP — Module Ownership Charter

> Who owns which module, what each module is allowed to import,
> and what is forbidden across module boundaries.
>
> This document is **prescriptive**: a future change must update
> the ownership row before reorganising imports, not after.
>
> Companion documents:
>
> - [`financial-core.md`](./financial-core.md) — what the canonical core is.
> - [`invariants.md`](./invariants.md) — the safety rules.
> - [`event-map.md`](./event-map.md) — the events crossing boundaries.
> - [`../../web/src/modules/DOMAIN_OWNERSHIP.md`](../../web/src/modules/DOMAIN_OWNERSHIP.md)
>   — the V20.8 frontend domain charter.

---

## 1. Backend ownership map (`src/`)

The backend is organised by **domain module**. Each module has:

- A clear ownership boundary.
- A barrel export (`src/<module>/index.ts` or the module file
  itself).
- A documented allowlist of imports.
- A forbidden-import list (cross-domain leaks).

| Module | Owner domain | Charter | Allowed imports | Forbidden imports |
| --- | --- | --- | --- | --- |
| `general-ledger/` | Accounting Core | The single canonical writer of `JournalEntry` / `JournalLine`. **Sole module allowed to call `prisma.journalEntry.create`.** | `prisma`, `common/`, `audit-logs/` | None — this is the deepest module. |
| `customer-ledger/` | Settlement Engine | Sole orchestrator of order settlement (`applyOrderWalletSettlementForCompletedOrder`). Owns the wallet-lock primitive. | `general-ledger/`, `wallets/`, `prisma`, `inventory/` | Direct imports from `orders/`, `payments/` (those depend on us, not the other way round). |
| `finance/` | Finance Domain | Canonical projection layer (Phase 2), snapshot/replay (Phase 3), reconciliation, debt visibility, collections, promises, aging, fraud, risk. | `general-ledger/`, `customer-ledger/`, `prisma`, `domain-events/`, `read-models/` | `orders/`, `payments/` (one-way dep). |
| `read-models/` | Read-side Projections | CQRS-lite projectors. Consumes `DebtVisibilityService` and snapshots; **never aggregates `JournalLine` directly**. | `finance/`, `prisma` (read-only delegate when wired) | Direct journal aggregation. |
| `domain-events/` | Event Bus | Typed event emitter (`@nestjs/event-emitter`). `@Global()`. Owns the outbox. | `prisma` | None. |
| `accounting/` | Accounting Operations | Period close, chart of accounts, accountant-facing reports. | `general-ledger/`, `finance/`, `read-models/`, `prisma` | None — read-only over canonical. |
| `orders/` | Order Intake | Order state machine (PENDING → COMPLETED → CANCELED). Delegates settlement to `customer-ledger/`. | `customer-ledger/`, `customers/`, `prisma`, `serial/`, `inventory/` | Direct journal writes. Direct `wallet.update`. |
| `payments/` | External Payment Gateway | UPayments integration (callback, status, recheck, watchdog). Verifies gateway, then delegates to `customer-ledger/`. | `customer-ledger/`, `prisma`, `orders/` | Direct journal writes. |
| `manager-custody/` | Cash Custody | Manager bag lifecycle (PENDING_DEPOSIT → AWAITING_VERIFICATION → VERIFIED). Driver→Manager handover via `CashService.confirmHandover`. | `prisma`, `audit-logs/`, `cash-monitor/` | Direct journal writes. |
| `cash-monitor/` | Cash Intelligence | 12 services around the cash classifier (SSoT for traffic light). Cursor-rule-protected: classifier rules are **immutable**. | `prisma`, `domain-events/` | Modifying the classifier rules without architectural review. |
| `cash-intelligence/` | Cash Intelligence v2 | Successor v2 service for the cash dashboard. | `cash-monitor/`, `prisma` | None. |
| `subscriptions/`, `subscribers/`, `subscription-plans/` | Subscriptions | Subscription lifecycle (ACTIVE → EXPIRED). Wallet credit on activation. | `customer-ledger/`, `wallets/`, `prisma`, `domain-events/` | Direct journal writes. |
| `customers/` | Customers | Customer master data + evaluator (rating heuristics). | `prisma`, `auth/` | Financial truth derivation. |
| `wallets/` | Wallets | Wallet read API. Wallet writes happen only via `customer-ledger/` (this module is read-side). | `prisma` | Direct wallet write. |
| `debt-holds/`, `debt-transfers/`, `loans/` | Payroll Debt | Employee debt holds, between-driver transfers, employee loans. | `general-ledger/`, `prisma`, `payroll/` | Direct wallet writes. |
| `payroll/` | Payroll | Payroll cycle. Owns `netSalaryKd` mapper (V21 Phase 5). | `general-ledger/`, `prisma`, `loans/`, `debt-holds/` | Direct journal writes. |
| `commissions/` | Commissions | Commission rules + payouts. | `prisma`, `general-ledger/`, `audit-logs/` | None. |
| `expenses/`, `vehicle-expenses/`, `fixed-expenses/` | Expenses | Operational expense workflows. | `prisma`, `general-ledger/`, `audit-logs/` | None. |
| `attendance/`, `shifts/`, `leaves/` | Workforce | Attendance + shift management + leave. | `prisma`, `audit-logs/` | None. |
| `inventory/`, `purchase-orders/`, `serials/`, `laundry-price-list/` | Inventory | Stock movements + serial counters + price list. | `prisma` | None. |
| `reports/`, `insights/`, `exports/` | Reports | Read-only financial reports. | `finance/`, `read-models/`, `general-ledger/`, `prisma` | Writes. |
| `call-center/` | Call Centre | CC operator workspace + queue + dispatch. | `customers/`, `customer-ledger/`, `payments/`, `prisma` | Direct journal writes. |
| `dispatch/`, `driver-oversight/` | Driver Operations | Driver dispatch + oversight workflows. | `prisma`, `cash-monitor/` | None. |
| `notifications/`, `customer-notifications/`, `feedback/` | Notifications | WhatsApp/SMS/email + customer feedback. | `prisma`, `auth/` | None — no financial side effects. |
| `audit-logs/` | Audit | The audit log. Immutable hash chain (per V20.5 migration). | `prisma`, `auth/` | None. |
| `auth/`, `permissions/`, `users/` | Identity & Access | JWT, RBAC, permission matrix. | `prisma`, `audit-logs/` | None. |
| `health/`, `observability/`, `system/`, `system-config/`, `system-guardian/`, `system-settings/` | Platform | Health checks, metrics, system config, guardian background jobs. | `prisma`, `redis` | None. |
| `bootstrap/` | Bootstrap | First-boot seeding (default price list, financial seeds, route logging). | All — bootstrap is special. | None — bootstrap is allowed to read everything. |
| `legacy/` | Legacy Quarantine | `@deprecated`-tagged back-compat readers. New imports forbidden. | (legacy) | New code MUST NOT import from `legacy/`. |
| `common/` | Shared utilities | Cross-cutting helpers (request id, correlation id, decorators). | `prisma` | Domain logic. |
| `pos/` | POS Server | POS-specific server-side helpers (e.g. cashier session). | `orders/`, `payments/`, `customer-ledger/` | Direct journal writes. |
| `accounting-reconciliation/` (in accounting) | Reconciliation | Daily reconciliation routines. | `finance/reconciliation`, `general-ledger/`, `prisma` | None. |
| `verify/` | Verification | Smoke verification utilities. | `prisma`, `health/` | None. |
| `safari-stream/` | SSE / Realtime | Server-sent events for the realtime dashboard. | `domain-events/`, `prisma` | None. |
| `feedback/`, `manager-documents/`, `payment-method-fees/` | Misc operational | Self-explanatory. | `prisma`, `audit-logs/` | None. |
| `queue-admin/` | Queue Admin | BullMQ admin endpoints. | `prisma`, `bullmq` | None. |
| `deployment/` | Deployment helpers | Deployment-time scripts and helpers. | `prisma` | None. |
| `invoice-audit/` | Invoice Audit | Supervisor edit/void of invoices. Calls canonical reversal. | `general-ledger/`, `customer-ledger/`, `prisma`, `audit-logs/` | None. |
| `prisma/` | Prisma Service + Guards | Prisma client + `guardJournalDelegate` extension + transaction primitives. | `prisma` | None. |

### Backend forbidden patterns (build-fail target)

| Pattern | Why it's forbidden | Where to put it instead |
| --- | --- | --- |
| `prisma.journalEntry.create` outside `general-ledger/` | Bypasses canonical writer | Use `DoubleEntryJournalService.appendBalanced` |
| `prisma.journalEntry.update` / `.delete` anywhere | Mutates immutable history | Use `appendInvoiceCancellationEntrySafe` (reversal pattern) |
| `prisma.debtLedgerEntry.update` / `.delete` anywhere | Mutates immutable history | Insert a contra-row instead |
| `prisma.customerWallet.update` outside `customer-ledger/` | Bypasses wallet lock + journal mirror | Use `customer-ledger/` orchestrator |
| `parseFloat` on a monetary string in `orders/`, `payments/`, `customer-ledger/`, `general-ledger/`, `manager-custody/` | Loses fils precision | Use `Prisma.Decimal` + `toMinorFromFixed4` |
| Cross-domain reach into `<other>/internal/` | Breaks barrel-export contract | Use the public barrel only |
| New imports from `legacy/` | Re-introduces deprecated readers | Migrate to canonical reader (`DebtVisibilityService`, etc.) |

---

## 2. Frontend ownership map (`web/src/modules/`)

The frontend was rationalised in V20.8 Phase 2 — see
[`web/src/modules/DOMAIN_OWNERSHIP.md`](../../web/src/modules/DOMAIN_OWNERSHIP.md)
for the full charter. Summary:

| Domain | Folder | Charter |
| --- | --- | --- |
| Finance UI Kit | `modules/finance/` | Server-canonical money primitives, financial cache, observability hooks. SINGLE source of truth for *display* of financial values. |
| Collections | `modules/collections/` | Collections workflow (queue, promises, escalation), the V20.7 Collections Operations Workspace shell + panes. |
| Customer 360 | `modules/customer360/` | Cross-domain customer detail surfaces composed from `finance` + `collections` primitives. |
| Subscribers | `modules/subscribers/` | Subscriber lifecycle UI (catalog, signup, rollover, cancel). |
| Dashboards | `modules/dashboards/` | Owner / GM / accountant overviews. Reads finance KPIs from `finance/api/observability-api`. |
| Accounting | `modules/accounting/` | Chart of accounts, period close, journal viewer. |
| Risk | `modules/risk/` | Risk recalculation history. |
| Fraud | `modules/fraud/` | Fraud alerts queue. |
| Call Center | `modules/callcenter/` (single word, current) and `modules/call-center/` (legacy kebab, migrating) | The CC operator workspace + queue + dispatch. |
| Driver | `modules/driver/` | Driver task surface, POS, deposits. |
| Manager | `modules/manager/` | Manager custody, my-documents, driver oversight. |
| Owner | `modules/owner/` | Owner-only pages. |
| Accountant | `modules/accountant/` | Accountant-only pages (KNET audit, inventory report, stock-in). |
| Shared | `modules/shared/` | TRULY cross-cutting concerns: auth, layout shells, navigation, generic UI primitives (`ui/`). NOT a dumping ground. |

### Frontend allowed imports

| From | May import | May NOT import |
| --- | --- | --- |
| `modules/<x>/components/*` | `@/modules/<x>/api`, `@/modules/<x>/hooks`, `@/modules/shared/*` | Other `modules/<y>/*` directly |
| `modules/<x>/pages/*` | `@/modules/<x>/components`, `@/modules/<y>` (via barrel only) | `@/modules/<y>/components/*` (deep) |
| `modules/<x>/api/*` | `@/lib/api`, `@/lib/api-client` | `react`, `@/components/*` (api is framework-free) |
| `modules/shared/*` | `@/lib/*`, `@/types/*` | Any specific domain (`finance/`, `collections/`, …) — would invert the dependency |

### Frontend forbidden patterns (build-fail target)

| Pattern | Why it's forbidden | Where to put it instead |
| --- | --- | --- |
| `parseFloat(amountKd)` | UI financial math (V21 guard) | Backend computes; frontend renders |
| Local `function formatKwd*` | Duplicates the canonical formatter | Import from `web/src/lib/kwd.ts` |
| Local `KWD_SUFFIX` constant | Duplicates the canonical formatter | Import from `web/src/lib/kwd.ts` |
| `array.reduce((s, x) => s + parseFloat(x.amountKd), 0)` | Frontend aggregation | Backend computes the total |
| Direct `apiJson` / `apiFetch` inside `modules/<x>/components` | Bypasses the typed API layer | Use the typed client in `modules/<x>/api/` via a hook in `modules/<x>/hooks/` |
| Deep relative import across modules (`../../<other>/…`) | Breaks the barrel contract | Use `@/modules/<other>` (barrel) |

---

## 3. Cross-domain communication

When two modules need to talk, the allowed mechanisms are:

| Mechanism | When | Owner |
| --- | --- | --- |
| Direct service call (typed import) | Same-process, same-domain (e.g. `OrdersService` calls `CustomerLedgerService`) | The caller. |
| Domain event (typed `EventEmitter2`) | One module fires-and-forgets a fact, others may react. Event names are typed in `domain-events/financial-domain-event.types.ts`. See [`event-map.md`](./event-map.md). | The producer. |
| HTTP API (controller → controller) | NEVER. Internal modules MUST use direct typed import. | — |
| Read model | A domain wants a denormalised projection of another domain's data. The producer writes the projection (or the snapshot listener does). The consumer reads only. | The producer. |

**Forbidden:** A module reaching across boundaries via `prisma`
directly to a table owned by another domain. Example: `payments/`
must NOT `prisma.customerWallet.update(...)` — instead it calls
`CustomerLedgerService.applyOrderWalletSettlementForCompletedOrder`.

---

## 4. Barrel-export rules

Every module exposes exactly one public surface:

```
src/<module>/index.ts        (barrel)
src/<module>/<module>.module.ts (NestJS module)
src/<module>/<module>.service.ts
src/<module>/<module>.controller.ts
src/<module>/<module>.types.ts
src/<module>/internal/...    (NOT exported from barrel)
```

External callers import from the barrel:

```ts
// ✅ allowed
import { FinanceModule, DebtVisibilityService } from '@/finance';

// ❌ forbidden
import { DebtVisibilityRepository } from '@/finance/debt-visibility/internal/repo';
```

`internal/*` files are private to the module. The barrel
explicitly re-exports the public surface only.

---

## 5. Ownership lifecycle

### When you add a new module

1. Pick the closest existing parent domain (e.g. a new "loyalty
   programme" service belongs under `customers/loyalty/`, not at
   the top level).
2. Add a row to the ownership table above.
3. Document allowed/forbidden imports.
4. Document any append-only tables (add to `invariants.md` §2).
5. Document any new `sourceRef` prefixes (add to
   `financial-core.md` §4).
6. Document any new domain events (add to `event-map.md`).

### When you split a module

- Keep the original public surface (re-exports) until a follow-up
  PR migrates the call sites.
- Update this document **first** with the new ownership rows.
- Run the dependency graph regeneration (Phase 3) to confirm no
  new cycles were introduced.

### When you delete a module

- Move it to `src/legacy/` first, with a `@deprecated` tag.
- Wait one release cycle; verify no telemetry hits.
- Then delete.

---

## 6. Ownership change requires a doc update

Changing module ownership without updating this document is a
**critical hygiene violation**. Reviewers must reject the change.

The frontend equivalent is
[`web/src/modules/DOMAIN_OWNERSHIP.md`](../../web/src/modules/DOMAIN_OWNERSHIP.md);
the same rule applies.
