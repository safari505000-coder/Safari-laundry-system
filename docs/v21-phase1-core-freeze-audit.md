# V21 — PHASE 1 — CORE FREEZE & CANONICAL ENFORCEMENT

## §0 — AUDIT REPORT

> Forensic sweep performed against the entire repository on the
> first day of the V21 Phase 1 mission. The eight checks below are
> the Phase 1 spec, run **after** the previous "Final Banking
> Stabilization & Legacy Retirement" mission completed.
>
> **Verdict**: the canonical core is already a write-isolated,
> append-only, decimal-safe, period-aware engine. Phase 1
> additionally promotes five secondary frontend pages from
> "documented technical debt" into the canonical comparison
> regime, locks the new boundary in two independent witnesses,
> and adds a 37-test architectural-shape spec.

---

## 1 — Direct Prisma writes to wallet / journal / debt tables

| Table              | Writers found            | Inside approved allowlist | Verdict |
|--------------------|--------------------------|---------------------------|---------|
| `JournalEntry`     | 0 outside canonical      | n/a                       | ✅ Locked |
| `JournalLine`      | 0 outside canonical      | n/a                       | ✅ Locked |
| `CustomerWallet`   | 3 (`customer-ledger`, `invoice-audit`, `call-center`) | All 3 allowlisted | ✅ Locked |
| `DebtLedgerEntry`  | 3 (`customer-ledger`, `invoice-audit`, `double-entry-journal`) | All 3 allowlisted | ✅ Locked |
| `TransactionHistory` | 0 deleteMany           | n/a                       | ✅ Append-only |
| `FinancialEventOutbox` | 0 deleteMany         | n/a                       | ✅ Append-only |

**Method.** `rg "(?:prisma|tx)\.(journalEntry|journalLine|customerWallet|debtLedgerEntry)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)" --type ts -g "src/**" --no-heading`.
Allowlists are now duplicated in **two** independent guard specs
(`v21-canonical-banking-guards.spec.ts` + `v21-phase1-core-freeze.spec.ts`).
Removing one does **not** silently weaken the other.

## 2 — Raw SQL financial writes

```
$ rg "\$executeRaw|\$executeRawUnsafe" --type ts src
0 matches
```

✅ Zero raw-SQL mutation paths exist anywhere in the backend.

## 3 — `appendBalanced` bypasses

The single canonical writer is `DoubleEntryJournalService.appendBalanced`
in `src/general-ledger/double-entry-journal.service.ts`. Every other
file that writes to `JournalEntry` / `JournalLine` is in the
allowlist or has been physically deleted in prior phases.

The new `v21-phase1-core-freeze.spec.ts > Anti-bypass suite`
re-runs the `directJournalWritePattern` scan as an independent
witness. Both specs must be removed for the bypass guard to silently
disappear.

✅ Zero bypasses.

## 4 — Hidden mutation paths (ORM aliases / proxies)

Searched for:
- `prisma.[a-z]+\.update` patterns with `prisma` shadowed
- Helper methods returning `prisma.$transaction` callbacks that
  embed undocumented writes
- Cron jobs that quietly write to financial tables

**Findings**:
- `outstanding-snapshot.cron.ts` — writes to `OutstandingSnapshot` (a projection table, not a financial-truth table). ✅ Out of scope.
- `financial-snapshot.cron.ts` — writes to `FinancialSnapshot`. ✅ Out of scope.
- All other cron jobs are read-only or write to non-financial tables.

✅ No hidden mutation paths.

## 5 — Duplicate settlement paths

The canonical settlement entry-point is
`CustomerLedgerService.settleInvoiceFifo` (FIFO settlement of
debt → wallet credit → journal). Searched for parallel
implementations:

```
$ rg "settle.*FIFO|debt-to-wallet|invoiceSettlement" --type ts src
```

All matches lead back to the canonical service. The `legacy-debt-readers.ts`
quarantined file (V20.6 Phase 2) is a **read-only adapter**, not a
settlement writer.

✅ No duplicate settlement paths.

## 6 — Unsafe `sourceRef` generation

Searched for non-deterministic patterns embedded in `sourceRef`
strings (`Math.random`, `Date.now()`, `crypto.randomUUID()`):

```
$ rg "sourceRef.*Math\.random|sourceRef.*Date\.now|sourceRef.*randomUUID" --type ts src
0 matches
```

Every `sourceRef` is constructed from stable business identifiers
(`JOURNAL:INVOICE_ISSUED:${orderId}`, `KNET:settle:${orderId}`, etc.).
Replays of the same business event produce the same `sourceRef`,
which is the foundation of the V20.6 idempotency contract.

✅ All `sourceRef`s deterministic.

## 7 — Frontend financial calculations (parseFloat / Number / Math.round)

### 7.1 Initial scan

`rg "Number\.parseFloat|parseFloat" --type tsx --type ts -g "web/src/**"` →
**~50 hits** across the frontend.

Classification:

| Bucket | Count | Disposition |
|--------|------:|-------------|
| Canonical helpers (lib/kwd.ts, lib/api.ts) | 9  | ✅ Internal to canonical layer |
| Operator POS surfaces (`pos-engine`, `DriverPOS`, `pos-auxiliary-ui`, `finance-engine.ts`, `create-order-dialog`, `invoice-supervisor-actions`) | 17 | ✅ Documented exception (V20.7 — operator-side change calc) |
| Form-input parsers (`expenses-page`, `fixed-expenses-page`, `subscriptions-page`, `payroll-unified-page` input boxes) | 6 | ✅ Form-to-backend conversion, not aggregation |
| Tolerance comparisons (`KnetAudit` `Math.abs(x-y) < 0.002`) | 2 | ✅ Reconciliation tolerance, not money math |
| Display formatting (`commission-rules-page` `parseFloat(x).toFixed(3)`) | 2 | 🟡 Pre-existing display helper; substitution = `formatKwdAmount` (V22 candidate) |
| Aggregations (`monthly-summary-page` `.toFixed(4)` reduce) | 1 | 🟡 Computes `totalApprovedKd` for display; precision-shift risk if migrated to `sumKwdStrings` |
| Net-pay re-computation (`payroll-page` lines 50-63) | 1 | 🟡 Shadow calc of backend `netSalaryKd`; V22 candidate |
| **Migrated this phase** (real money-math leaks closed) | **5** | ✅ See §8 below |

### 7.2 Files migrated this phase

| File | Pattern | Replacement |
|------|---------|-------------|
| `web/src/modules/call-center/dashboard/components/tabs/overview-tab.tsx` | `parseFloat(f.totalDueKd) > 0.0001` + `parseFloat(...subscriptionValueKd) > 0` | `isMaterialKd(f.totalDueKd)` + `isPositiveKd(...)` |
| `web/src/modules/shared/lib/whatsapp-links.ts` | `parseFloat(row.debt.totalDebt) > 0` | `isPositiveKd(row.debt.totalDebt)` |
| `web/src/pages/payroll-page.tsx` | 4× `parseFloat(p.<field>) > 0` display gates | 4× `isPositiveKd(...)` |
| `web/src/pages/unpaid-invoices-page.tsx` | `parseFloat(m.otherKd) >= 0.0001` | `isMaterialKd(m.otherKd)` |
| `web/src/pages/feedback-inbox-page.tsx` | `parseFloat(row.order.totalKd).toFixed(3)` | `formatKwdAmount(row.order.totalKd)` |

All 5 files are now in the `moneyComparisonGuardedFiles`
allowlist of `v21-canonical-banking-guards.spec.ts`. Re-introducing
a `parseFloat`-on-money pattern in any of them fails CI.

### 7.3 New canonical helper

`isMaterialKd(value)` — returns `true` iff `Math.abs(value) >= 0.0001`
(the canonical 4dp precision boundary used by the backend
`Prisma.Decimal` layer). This codifies the legacy
`parseFloat(value) >= 0.0001` pattern as a single canonical
function and is now the only valid way to express
"this number is worth showing" in the UI. Added to
`web/src/lib/kwd.ts` + tested in `web/src/lib/kwd.test.ts`.

## 8 — Audit summary table

| Check                                              | Phase 1 finding |
|----------------------------------------------------|-----------------|
| Direct journal writes outside canonical            | **0** ✅ |
| Direct wallet writes outside allowlist             | **0** ✅ |
| Direct debt-ledger writes outside allowlist        | **0** ✅ |
| `deleteMany` on append-only financial tables       | **0** ✅ |
| Raw SQL financial writes (`$executeRaw*`)          | **0** ✅ |
| `appendBalanced` bypasses                          | **0** ✅ |
| Hidden mutation paths (cron / proxy)               | **0** ✅ |
| Duplicate settlement paths                         | **0** ✅ |
| Unsafe `sourceRef` generation                      | **0** ✅ |
| Frontend money-math leaks closed this phase        | **5** ✅ |
| Documented frontend exceptions (POS / form input)  | 25 (unchanged from prior mission) |
| Frontend tech-debt residue (commission, monthly-summary, payroll-page net-pay) | 3 (V22 candidates) |

## 9 — Forensic verdict

The canonical core is **fully locked** at the write boundary, the
`sourceRef` boundary, the period-lock boundary, the snapshot
boundary, and the comparison-helper boundary. The five frontend
files migrated this phase eliminate the remaining real
money-math leaks; the three residual cases are documented
display-only patterns scheduled for V22.

The audit recommends Phase 1 proceed to enforcement (objectives
2-6 of this mission). See `docs/v21-phase1-implementation.md`
for the implementation report, `docs/v21-phase1-validation.md`
for the validation report, and `docs/v21-phase1-scorecard.md`
for the scorecard + rollback step.
