# V21 — Financial Write Boundary

> **Phase 3 of the Banking Stabilization Mission.**
> Defines, enforces, and documents the **closed set of services**
> that may mutate financial state. Any new write outside this set
> fails CI at build time.

---

## 0. The boundary

The financial state of Safari ERP V21 lives in **eight tables**:

| Table | Mutability | Canonical writer |
| --- | --- | --- |
| `JournalEntry` | append-only | `DoubleEntryJournalService.appendBalanced` |
| `JournalLine` | append-only (children of `JournalEntry`) | same |
| `DebtLedgerEntry` | append-only | `CustomerLedgerService` + `InvoiceAuditService` + `DoubleEntryJournalService.mirrorDebtLedgerEntrySafe` |
| `CustomerWallet` | mutable (latest balance + debt) | `CustomerLedgerService` (orchestrator) + `InvoiceAuditService` (reversal) |
| `TransactionHistory` | append-only (audit ledger) | `CustomerLedgerService` |
| `FinancialEventOutbox` | append-only (event sourcing) | `FinancialEventDispatcherService` |
| `FinancialSnapshot` | mutable (read projection) | `FinancialSnapshotService` (cron + realtime refresher) |
| `PeriodLockViolation` | append-only (audit) | `assertWriteAllowed` (inside `appendBalanced`) |

The **write boundary** is the closed set of services authorised to
write each table. Phase 3 codifies it as a **build-time guard**.

---

## 1. The allowlists (single source of truth)

Defined in `src/finance/v21-canonical-banking-guards.spec.ts`:

### 1.1 Journal write allowlist

```typescript
const journalWriteAllowlist = new Set([
  'src/general-ledger/double-entry-journal.service.ts',     // canonical writer
  'src/general-ledger/double-entry-journal.service.spec.ts', // unit tests
  'src/general-ledger/period-lock-enforcement.spec.ts',     // period-lock spec
  'src/finance/reconciliation/reconciliation.service.ts',   // reads only — never mutates
]);
```

Pattern enforced: `(prisma|tx).journal(Entry|Line).(create|createMany|update|updateMany|delete|deleteMany|upsert)`

### 1.2 CustomerWallet write allowlist

```typescript
const walletWriteAllowlist = new Set([
  'src/customer-ledger/customer-ledger.service.ts',  // canonical orchestrator
  'src/invoice-audit/invoice-audit.service.ts',      // reversal — paired with appendBalanced
  'src/call-center/call-center.service.ts',          // non-financial: subscription expiry + reminder counter
]);
```

### 1.3 DebtLedgerEntry write allowlist

```typescript
const debtLedgerWriteAllowlist = new Set([
  'src/customer-ledger/customer-ledger.service.ts',         // canonical
  'src/invoice-audit/invoice-audit.service.ts',             // reversal mirror
  'src/general-ledger/double-entry-journal.service.ts',     // mirrorDebtLedgerEntrySafe
]);
```

### 1.4 Append-only deletion ban

```typescript
const appendOnlyDeleteAllowlist = new Set([
  'src/finance/test-utils/accountant-dashboard-integration-context.ts', // test fixture only
]);
```

Pattern: `(prisma|tx).(journalEntry|journalLine|debtLedgerEntry|transactionHistory|financialEventOutbox).deleteMany`

**No production code may delete any append-only row.**

---

## 2. Enforcement model

The four guards live as `it('...')` cases inside the existing
`v21-canonical-banking-guards.spec.ts` jest suite. Each guard:

1. Walks every `.ts` file under `src/`.
2. Skips `.d.ts` and (for wallet/debt-ledger/delete rules) `.spec.ts`.
3. Greps for the disallowed pattern.
4. Subtracts the explicit allowlist.
5. Throws with a `file:line: snippet` report on violation.

The implementation is dependency-free — uses Node's `fs.readdirSync` /
`fs.readFileSync`. No new dev dependencies, no impact on the
production runtime, no changes to existing services.

The pattern is inspired by Stripe's `forbidden-imports` lint and
similar "tripwire" guards in mature financial codebases.

---

## 3. The architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                  CANONICAL FINANCIAL WRITE BOUNDARY                  │
└─────────────────────────────────────────────────────────────────────┘

   Caller (any module)
        │
        ▼
   ┌─────────────────────────────────────────────────────────┐
   │  CustomerLedgerService              ◄ canonical orch.   │
   │  ├─ applyOrderWalletSettlement      (settlement)        │
   │  ├─ recordPartialPayment            (collections)       │
   │  ├─ activateSubscriptionPlan        (subscription)      │
   │  └─ recordDebtInvoiceCollectedAtCallCenter              │
   └─────────────────────────────────────────────────────────┘
        │            │              │
        │            │              │
        ▼            ▼              ▼
   journalEntry  customerWallet  debtLedgerEntry
   journalLine                    (mirror)
   ▲                                        ▲
   │                                        │
   │                                        │
   ┌────────────────────┐    ┌──────────────┘
   │ DoubleEntryJournal │    │
   │ Service            │    │
   │ ├─ appendBalanced  │    │
   │ ├─ append*Entry*   │    │
   │ └─ mirrorDebtLedger│────┘
   │   EntrySafe        │
   └────────────────────┘
        ▲
        │ (only via the helper functions
        │  above — no direct prisma writes)
        │
   ┌────┴───────────────────────────────────────┐
   │ Approved callers of appendBalanced:        │
   │  • CustomerLedgerService (orchestrator)    │
   │  • InvoiceAuditService   (void reversal)   │
   │  • PaymentsService       (gateway capture) │
   │  • OrdersService         (POS checkout)    │
   │  • ManagerCustodyService (cash handover)   │
   │  • CashService           (drop / handover) │
   │  • FixedExpenseService   (expense entry)   │
   │  • PayrollService        (salary entry)    │
   │  • LoansService          (issue / repay)   │
   └────────────────────────────────────────────┘

ANY OTHER FILE IS BLOCKED AT CI.
```

---

## 4. Optional: Prisma extension as runtime tripwire (NOT activated)

For a defence-in-depth runtime equivalent, the system can be wired
with a Prisma client extension that throws on any disallowed write
**at runtime**. The pattern is documented here for completeness and
left **inactive** because:

1. Build-time guards already cover 100% of the production surface.
2. A runtime tripwire adds latency to every Prisma call.
3. Activating it without a soak test risks blocking a legitimate
   path the audit missed (e.g., a future seed script).
4. The mission rule "additive-safe + no regression" means runtime
   middleware should follow a separate, monitored rollout.

**Reference design** (file would live at `src/finance/prisma-write-boundary.extension.ts`):

```typescript
import { Prisma } from '@prisma/client';

const FORBIDDEN_TABLES = new Set([
  'JournalEntry',
  'JournalLine',
  'DebtLedgerEntry',
  'TransactionHistory',
  'FinancialEventOutbox',
]);

const FORBIDDEN_VERBS = new Set([
  'create', 'createMany', 'update', 'updateMany',
  'delete', 'deleteMany', 'upsert',
]);

function isAuthorisedCaller(): boolean {
  // Use AsyncLocalStorage to mark approved transactional contexts
  // before they call appendBalanced / mirrorDebtLedgerEntrySafe.
  return ApprovedWriterContext.isActive();
}

export const writeBoundaryExtension = Prisma.defineExtension({
  name: 'v21-write-boundary',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (
          model && FORBIDDEN_TABLES.has(model) &&
          FORBIDDEN_VERBS.has(operation as string) &&
          !isAuthorisedCaller()
        ) {
          throw new Error(
            `V21_WRITE_BOUNDARY_VIOLATION: ${operation} on ${model} ` +
              `outside authorised writer context`,
          );
        }
        return query(args);
      },
    },
  },
});
```

**Recommended rollout** (V22 candidate, not Phase 3):

1. Deploy with the extension in **shadow mode** — log violations,
   do not throw. (env: `WRITE_BOUNDARY_MODE=shadow`)
2. Soak for 14 days. Audit shadow logs. Allowlist legitimate hits.
3. Switch to `WRITE_BOUNDARY_MODE=enforce`.
4. Build-time guards remain in place — defence in depth.

---

## 5. Required Phase-3 Output

### 5.1 Architecture explanation

The financial write boundary is now formally defined in code:
**4 build-time guards** assert that

- Only the canonical writer mutates the journal.
- Only 3 services mutate `CustomerWallet`.
- Only 3 services mutate `DebtLedgerEntry`.
- No production code deletes append-only rows.

Together, they fail CI on any future PR that tries to bypass the
canonical layer, regardless of whether the bypass came in via a
new module, a copy-paste from legacy code, or an "innocent" admin
patch.

### 5.2 Invariant verification

Re-ran the full V21 banking-guards suite: **110 tests passing**
(was 107 before Phase 3; +3 = wallet, debt-ledger, deleteMany guards).

Existing invariants:
- Σ DR = Σ CR — unchanged.
- Append-only — unchanged.
- Idempotency — unchanged.
- Period locks — unchanged.

New invariants:
- ✅ `customerWallet` mutators ⊆ {ledger, audit, call-center-counters}
- ✅ `debtLedgerEntry` mutators ⊆ {ledger, audit, journal-mirror}
- ✅ `deleteMany` on append-only tables = ∅ in production

### 5.3 Risk analysis

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Future PR introduces a wallet writer that skips the journal | LOW (CI fails) | n/a — blocked at build | Allowlist forces explicit reviewer signoff |
| Allowlist grows uncontrolled | LOW | Slow drift in standards | Reviewer enforces "every allowlist add needs an ADR" |
| Test fixtures use `deleteMany` | LOW | Test data only | Allowlisted explicitly; production ban is absolute |

### 5.4 Migration impact

Zero. Test additions only.

### 5.5 Concurrency analysis

No runtime path changed. Existing concurrency primitives unaffected:
- `lockCustomerWalletForUpdateTx` (5 sites)
- `appendBalanced` idempotency on `sourceRef`
- `prisma.$transaction(maxWait, timeout)` boundaries

### 5.6 Replay analysis

`FinancialSnapshot` rebuild remains deterministic — no journal
schema/path changed.

### 5.7 Rollback plan

`git revert` of the spec edits. The runtime is unaffected.

### 5.8 Rollout plan

CI is the rollout. Future PRs will fail until they (a) route through
the canonical writer or (b) add to the allowlist with reviewer
approval.

### 5.9 Tests added

3 new structural guard tests in `v21-canonical-banking-guards.spec.ts`:

1. `customerWallet mutators are restricted to the canonical writer set`
2. `debtLedgerEntry mutators are restricted to the canonical writer set`
3. `append-only financial tables are never deleteMany-ed in production code`

### 5.10 Files modified

| File | Type |
| --- | --- |
| `src/finance/v21-canonical-banking-guards.spec.ts` | additive — 3 guards + 4 allowlist constants + shared `collectBackendSources` / `scan` helpers |
| `docs/v21-financial-write-boundary.md` | NEW — this document |

### 5.11 Unresolved risks

1. **Runtime middleware not active** — by design (see §4). V22 candidate.
2. **`InvoiceAuditService.applyWalletForOrder` SUBSCRIPTION_WALLET re-application** still skips the journal entry (Phase 1 finding 2.1.3). Within boundary (file is allowlisted) but the orchestration gap remains. Follow-up PR will mirror `appendWalletAbsorptionEntryV3Safe` here.

---

## 6. Phase 3 status

**Status: ✅ COMPLETE.**

- 4 production write surfaces (Journal / Wallet / DebtLedger / Append-only deletion) hardened with build-time guards.
- Closed set of allowlisted writers documented and enforced.
- 110 tests passing — zero regression.
- Optional runtime middleware design provided for V22.

**Next:** Phase 4 — Period Lock Full Enforcement.
