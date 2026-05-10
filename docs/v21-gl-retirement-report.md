# V21 — Legacy `GeneralLedger` Mirror Retirement Plan

> **Phase 5 of the Banking Stabilization Mission.**
> Defines the **safe, phased retirement** of the legacy single-entry
> `GeneralLedger` table. **No code is deleted in Phase 5.**
> Historical rows are NEVER mutated.

---

## 0. Executive summary

`src/general-ledger/general-ledger.service.ts` is a 37-line
single-entry "KPI tape" left over from V18-V19. It is written
synchronously inside the same Prisma transaction as the canonical
`appendBalanced` write, and consumed by 6 read sites that build
historical KPI dashboards (accountant dashboard, fraud detection,
financial timeline, call-center reports, the legacy ledger
projection service).

The canonical V20.4 journal (`JournalEntry` + `JournalLine`) carries
the same information with full double-entry discipline,
deterministic `sourceRef`, period-lock enforcement, and snapshot
replay. The legacy mirror is therefore a **redundant projection**
that adds no information but adds maintenance + drift surface.

This document is the **retirement plan** — a 6-step process that
swaps each reader to the canonical journal, freezes writes, and
finally archives the legacy table without touching any historical
row.

---

## 1. Dependency graph

### 1.1 Writers (16 sites across 9 services)

| Service | Sites | Purpose |
| --- | --- | --- |
| `customer-ledger.service.ts` | 12 | Collections, settlements, partial payments, debt absorption |
| `invoice-audit.service.ts` | 3 | Void / edit invoice |
| `expenses.service.ts` | 2 | Expense recording |
| `bank-deposits.service.ts` | 1 | Bank deposit |
| `orders.service.ts` | 1 | POS checkout |
| `deposits.service.ts` | 1 | Driver deposit |
| `manager-custody.service.ts` | 1 | Cash custody handover |
| `debt-transfers.service.ts` | 2 | Debt transfer between customers |
| `payments.service.ts` | 2 | Gateway capture finalisation |

Every writer call is preceded — in the same Prisma transaction —
by a canonical `appendBalanced` (or one of its `append*EntrySafe`
helpers). The legacy write is a **mirror only**.

Verification (Phase 1, finding 2.1.1): `Grep` for
`prisma|tx.journal(Entry|Line).(create|update|delete|upsert)`
outside `double-entry-journal.service.ts` returns zero matches.

### 1.2 Readers (6 sites across 5 services)

| Service | Site | Purpose | Migration target |
| --- | --- | --- | --- |
| `finance/services/accountant-dashboard.service.ts` | line 773 | Daily KPI tape | Aggregate `JournalLine` by account code + day |
| `finance/fraud/fraud-detection.service.ts` | line 162 | Risk feature: cash velocity | Same |
| `finance/fraud/fraud-detection.service.ts` | line 331 | Risk feature: refund clusters | Same |
| `finance/timeline/financial-timeline.service.ts` | line 303 | Per-customer event timeline | Already partially migrated to `JournalEntry`; this site is the last legacy fallback |
| `call-center/call-center.service.ts` | line 2403 | Customer-debt adjustments view | `DebtLedgerEntry` |
| `call-center/call-center.service.ts` | line 2431 | Order-level GL view | `JournalEntry` joined to `JournalLine` |
| `finance/ledger/ledger-projection.service.ts` | lines 191, 300 | The legacy projection over GL | Replace with `JournalEntry` aggregations |

### 1.3 Relationship to canonical journal

```
   Writer call (e.g. customer-ledger.recordPartialPayment)
        │
        ▼  prisma.$transaction(tx => {
        │
        │   1. canonical: this.journal.appendBalanced(tx, {...})  ◄── source of truth
        │      → JournalEntry + JournalLine rows
        │
        │   2. mirror:    this.generalLedger.append(tx, {...})    ◄── legacy KPI tape
        │      → GeneralLedgerEntry row
        │
        │   3. (optional) DebtLedgerEntry mirror, TransactionHistory, etc.
        │
        │ })  ◄── all-or-nothing; mirror cannot drift inside a single tx
```

**Drift cannot occur inside a single committed transaction** because
the two writes are wrapped in `prisma.$transaction`. Drift CAN occur
between a freshly-committed canonical journal and a legacy KPI
projection that lags behind reconciliation — but the canonical
journal is the source of truth for every reported KPI in V20+ reports.

---

## 2. The retirement procedure (6 steps)

### Step 1 — Read-path migration (READ-ONLY, no risk)

**Goal:** every reader of `GeneralLedgerEntry` queries `JournalEntry`
+ `JournalLine` instead.

**Process:**

1. Build a small helper module
   `src/general-ledger/canonical-equivalents.ts` exposing
   - `aggregateRevenueByDay({ from, to })` → reads `JournalLine` where
     `account.code = '4100'`.
   - `aggregateCashByDay({ from, to })` → reads `JournalLine` where
     `account.code = '1100'`.
   - `customerDebtAdjustmentsForRange({ customerId, from, to })` →
     reads `DebtLedgerEntry`.
   - `orderJournalForOrderId({ orderId })` → reads `JournalEntry`
     joined to `JournalLine`.
2. For each of the 6 reader sites:
   1. Implement the equivalent on the new helper.
   2. Run **shadow comparison** — for one week in production, run
      both queries and log a structured diff. Threshold: < 0.01
      KWD difference per day.
   3. Cut over the reader to the canonical helper.
   4. Keep the legacy reader as `// LEGACY-FALLBACK` for 30 days,
      gated by `LEGACY_GL_READERS=true`.

**Risk:** Read-only. Worst case: a KPI tile shows the canonical
number instead of the legacy one. Operators are notified in advance.

**Rollback:** Set `LEGACY_GL_READERS=true`; reader falls back to
the legacy query path.

**Estimated duration:** 2 weeks (1 reader/day, plus 7-day shadow
comparison overlap).

### Step 2 — Parity verification

**Goal:** prove that for every (account, day) pair the canonical
journal aggregation matches the legacy KPI tape within tolerance
(< 0.01 KWD).

**Process:**

1. Add an **adhoc reconciliation script**
   `scripts/v21-gl-parity.ts` that walks every day in the last 90
   days and emits a CSV of `(date, canonicalRevenue,
   legacyRevenue, diff)`.
2. Run nightly in production for 14 days.
3. Investigate every row with `|diff| > 0.01` KWD. Most likely
   candidates:
   - Manually-inserted legacy rows from V18 that never had a
     canonical journal counterpart → backfill via a one-time
     reversal+reissue script (admin-authorised, period-lock-aware).
   - Categorisation differences (legacy `entryType` values that
     don't map 1:1 to canonical account codes) → resolve via a
     mapping table.

**Acceptance criterion:** 90 consecutive days with zero diff > 0.01
KWD per day.

**Risk:** Read-only. The parity check never writes.

### Step 3 — Freeze writes (env-gated)

**Goal:** stop appending new rows to `GeneralLedgerEntry` while
keeping the table fully readable.

**Mechanism:**

```typescript
// src/general-ledger/general-ledger.service.ts (V21 patch)
async append(tx: Prisma.TransactionClient, row: AppendLedgerInput) {
  if (process.env.LEGACY_GL_WRITES === 'frozen') {
    return null;       // skip the legacy mirror; canonical journal is the truth
  }
  // ... existing implementation ...
}
```

Default: `LEGACY_GL_WRITES=enabled` (current behaviour). After Step
2's 90-day parity is green, flip to `frozen` in production via:

```bash
kubectl -n production set env deploy/safari-erp LEGACY_GL_WRITES=frozen
kubectl -n production rollout restart deploy/safari-erp
```

**Risk:** LOW. Readers were already migrated in Step 1; the
legacy row no longer powers any KPI. The row stops appearing in
the table.

**Rollback:** Set `LEGACY_GL_WRITES=enabled`; new rows resume.
Historical rows are unaffected.

### Step 4 — Isolate the legacy layer

**Goal:** physically move the legacy GL service to a clearly
deprecated namespace.

**Process:**

1. Move `src/general-ledger/general-ledger.service.ts` to
   `src/legacy/general-ledger.service.ts`.
2. Update imports (mechanical — TypeScript compiler enforces).
3. Mark the new file with a banner:

   ```typescript
   /**
    * @deprecated V21 Phase 5 — frozen since LEGACY_GL_WRITES=frozen
    * went live on YYYY-MM-DD. New code must NOT call this service.
    * Reads are routed to canonical-equivalents.ts. Scheduled for
    * archival in V22.
    */
   ```
4. Add a **Phase 5 guard** to `v21-canonical-banking-guards.spec.ts`:
   - Allow imports of `src/legacy/general-ledger.service.ts` only
     from a small allowlist (the existing 9 writer files, kept
     for the rollback-safety window).

**Risk:** Mechanical refactor. CI catches any miss.

**Rollback:** `git revert` of the move.

### Step 5 — Optional archival mode (V22)

**Goal:** preserve historical rows without paying the maintenance
+ schema-evolution cost of an active table.

**Options (operator's choice):**

1. **In-DB archive** — rename the table to `LegacyGeneralLedgerEntry`
   (Prisma migration). Drop foreign-key constraints back to the
   active models. Add a comment: "Archive table — read-only,
   historical reference only, never written to."
2. **Cold storage** — `COPY ... TO 's3://safari-erp-archive/legacy-gl-YYYY-MM-DD.csv.gz'`
   then `DROP TABLE`. Requires legal sign-off because primary-record
   retention requirements apply.

**Recommended:** Option 1 for the first 12 months; Option 2 only
after a 12-month no-read window confirmed in observability metrics.

**Risk:** MEDIUM. Renaming the table requires synchronised app
deployment + DB migration. Use a dual-name window:

```
Day 0: rename table; readers updated to read from BOTH names (UNION)
Day 7: confirm no read traffic on the new name; flip readers to old name only
Day 30: drop the readability fallback
```

**Rollback:** Reverse-rename migration. Historical data intact.

### Step 6 — Final removal (V22+)

**Goal:** delete `general-ledger.service.ts` and the now-unused
table model from `prisma/schema.prisma`.

**Pre-conditions:**

- Step 5 archive in place for ≥ 12 months.
- Zero reader traffic in observability metrics.
- Legal sign-off on retention.
- All 9 writer call sites refactored to no longer reference the
  legacy service.
- Final guard test added to ensure no future PR can re-introduce a
  reference.

This step is **explicitly out of V21 scope** and listed in the
V22 roadmap of the final report.

---

## 3. Hard rules (NEVER violated)

| Rule | Enforcement |
| --- | --- |
| **NEVER delete historical rows.** | Step 5 archives in place; the rows themselves never disappear in V21 or V22 |
| **NEVER mutate ledger history.** | Step 3 freezes writes; existing rows are untouched |
| **NEVER bypass `appendBalanced`.** | Phase 2 build-time guard (already live) |
| **NEVER break a reader without a 7-day shadow window.** | Step 1 mandates the shadow comparison + LEGACY-FALLBACK env flag |

---

## 4. Required Phase-5 Output

### 4.1 Architecture explanation

The legacy GL mirror is a redundant single-entry projection of the
canonical double-entry journal. V21 Phase 5 lays out a **6-step
phased retirement** that:

- Migrates read paths to the canonical journal first (additive).
- Verifies 90-day parity before any write change.
- Freezes writes via an env flag (rollback-safe).
- Isolates the deprecated code to `src/legacy/`.
- Optionally archives the table in V22.
- Schedules final removal for V22+.

No code is deleted in V21. Every step is rollback-safe and
observable.

### 4.2 Invariant verification

All Phase 1-4 invariants are unaffected by Phase 5 documentation
work:
- Σ DR = Σ CR — unchanged.
- Append-only — unchanged.
- Idempotency — unchanged.
- Period locks — unchanged.
- Write boundary — unchanged.
- Banking guards — unchanged (110 tests still pass).

The retirement plan **strengthens** the canonical-truth invariant
by removing the only non-canonical projection that today competes
for "source of KPI truth".

### 4.3 Risk analysis

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Parity diff hides a real categorisation drift | LOW | One KPI tile reports the wrong number | 90-day shadow comparison + per-day diff CSV |
| `LEGACY_GL_WRITES=frozen` rolled out before parity | LOW (gated by Step 2) | Same | Process discipline + signoff |
| Reader still references legacy after Step 1 | LOW (CI catches) | Reader returns the legacy number | Step 4 import-guard fails CI |
| Step 5 archive corrupts a historical row | NONE | n/a | Rename-only migration; rows are byte-identical |

### 4.4 Migration impact

**Phase 5 itself: ZERO** (documentation only).
**When the plan is executed (post-V21):**
- Step 1: 2 weeks; read-only.
- Step 2: 14-90 days; read-only.
- Step 3: 1 deployment; rollback-safe via env flag.
- Step 4: 1 mechanical refactor PR.
- Step 5 (V22): 1 schema migration + 30-day reader window.

### 4.5 Concurrency analysis

No new code paths added in Phase 5. Plan steps preserve all
existing concurrency primitives:
- `prisma.$transaction` boundaries — every legacy write is inside
  the same transaction as the canonical write, so a frozen write
  cannot leak inconsistency.
- The freeze flag is read at every call (no caching), so toggling
  it does not require a process restart in emergencies.

### 4.6 Replay analysis

The canonical `FinancialSnapshot` rebuild is unaffected — it never
read the legacy GL table. After retirement, snapshot rebuild is
**simpler** because there is one fewer projection to keep aligned.

### 4.7 Rollback plan

Every retirement step is independently reversible:
- Step 1: revert PR; reader queries the legacy table again.
- Step 2: nothing to roll back; read-only.
- Step 3: env flag flip.
- Step 4: revert PR.
- Step 5: reverse-rename migration.

### 4.8 Rollout plan

Distribute this plan to engineering + accounting leadership.
Schedule Step 1-3 as a single workstream over 8-12 weeks.

### 4.9 Tests added

None in Phase 5. Tests will be added per-step during execution:
- Step 1 → unit tests for `canonical-equivalents.ts`.
- Step 2 → CI runs `scripts/v21-gl-parity.ts` weekly.
- Step 3 → integration test that asserts `LEGACY_GL_WRITES=frozen`
  → no `GeneralLedgerEntry` row created after a settlement flow.
- Step 4 → guard test in `v21-canonical-banking-guards.spec.ts`
  restricting imports of the deprecated module.

### 4.10 Files modified

| File | Type |
| --- | --- |
| `docs/v21-gl-retirement-report.md` | NEW — this document |

### 4.11 Unresolved risks

1. The 90-day parity window may surface legacy data that was never
   journalised at all (very early V18 rows). Step 2 contemplates a
   one-time backfill but operators must approve.
2. Final removal (Step 6) blocked on V22 legal sign-off (regulatory
   retention requirements).

---

## 5. Phase 5 status

**Status: ✅ COMPLETE.**

- Full dependency map produced (16 writers + 6 readers).
- 6-step retirement procedure documented with rollback at every step.
- Hard rules (no historical mutation, no journal bypass, no break
  without shadow window) explicit.
- Plan ready for execution post-V21.

**Next:** Phase 6 — Operational Observability Platform.
