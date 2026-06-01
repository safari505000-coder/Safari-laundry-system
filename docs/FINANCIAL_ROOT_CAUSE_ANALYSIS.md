# Financial Root Cause Analysis — the 13 KD Drift

> Scope: explain the **real** reason a ~13 KD discrepancy was able to appear in
> the ledger, where in the code it originated, why it was not caught early, and
> which protections were missing. This document is derived **only** from the
> current source code (no reliance on the trial data that produced the 13 KD).
>
> Status of the 13 KD itself: **irrelevant** — it came from trial data. The goal
> of this analysis is to permanently close the *class of bug*, not to patch the
> number.

---

## 1. TL;DR

The 13 KD was a **`WALLET_LIABILITY` under-journaling** drift: a customer wallet
movement was committed to the read-model (`CustomerWallet.balance` /
`TransactionHistory`) **without** its matching balanced journal entry.

There are **two independent root causes**, and *both* had to be present for the
drift to appear *and survive undetected*:

| Layer | Root cause | File |
|-------|-----------|------|
| **Creation** | Journal mirror writers are **fail-open by default**: when a journal write throws, the wrapper logs + persists a `JournalFailureLog` row, returns `null`, and lets the surrounding business transaction **commit anyway**. The balance moved; the ledger did not. | `src/general-ledger/double-entry-journal.service.ts` |
| **Detection** | A reconciliation engine that *would* have caught this (`WALLET_LIABILITY_MATCH` invariant) exists but is **disabled by default** (`RECONCILIATION_CRON_ENABLED != true`), its `finance.drift.detected` events are **not routed to any owner/Discord alert**, and it is **not surfaced** on an owner endpoint. The detector was asleep. | `src/finance/reconciliation/reconciliation.service.ts` |

In one sentence: **a non-atomic, fail-open journal write created the drift, and the dormant reconciliation engine never told anyone.**

---

## 2. How double-entry posting is *supposed* to work

The core writer `DoubleEntryJournalService.appendBalanced()` is **correct and
strict**. Before it inserts anything it enforces every invariant we want:

```188:254:src/general-ledger/double-entry-journal.service.ts
  async appendBalanced(
    db: Db,
    input: AppendJournalInput,
  ): Promise<{ id: string }> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    if (!input.sourceRef?.trim()) throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
    if (input.lines.length < 2) throw new Error('JOURNAL_MINIMUM_TWO_LINES');
    ...
    if (totalDebit.sub(totalCredit).abs().gt(new Prisma.Decimal('0.001'))) {
      throw new Error('UNBALANCED_JOURNAL');
    }
```

Key guarantees of `appendBalanced`:

- **Debit = Credit** per entry (±0.001 KD) → `UNBALANCED_JOURNAL`.
- **No negative lines** → `NEGATIVE_JOURNAL_LINE`.
- **No ambiguous lines** (both debit and credit > 0) → `AMBIGUOUS_JOURNAL_LINE`.
- **No empty lines** → `EMPTY_JOURNAL_LINE`.
- **Idempotent on `sourceRef`** (returns the existing entry on duplicate) →
  duplicate posting is impossible for a given deterministic `sourceRef`.
- **Account codes must exist** → `JOURNAL_ACCOUNT_NOT_FOUND`.

**Conclusion:** a *single* journal entry can never be internally unbalanced.
The 13 KD was therefore **not** an imbalanced entry — it was a **missing**
entry. That distinction is the whole story.

---

## 3. Where the drift is actually created — the fail-open `*Safe` wrappers

Money-movement flows do not call `appendBalanced` directly. They call the
`*Safe` wrappers, which were designed (Phase 16) to *never* let a journal
problem roll back a real payment. The contract is documented in the code:

```291:320:src/general-ledger/double-entry-journal.service.ts
   * Wraps {@link mirrorDebtLedgerEntry} so journal-side failures
   * (missing seeded account, balance check, unique constraint, DB
   * timeout, …) NEVER abort the surrounding business transaction
   * for the FIRST few attempts. Every failure:
   *   1) emits a `[JOURNAL_WRITE_FAILED]` log line
   *   2) persists a row in `JournalFailureLog` ...
   *   3) checks recent failure density ... throws
   *      {@link CriticalJournalFailureError} ...
```

The catch path returns `null` and lets the caller continue:

```322:353:src/general-ledger/double-entry-journal.service.ts
  async mirrorDebtLedgerEntrySafe(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    try {
      return await this.mirrorDebtLedgerEntry(db, input);
    } catch (err) {
      ...
      await this.persistFailure(input, message, errorCode);
      await this.tripBreakerIfNeeded(input.customerId);
      return null;   // <-- business transaction proceeds WITHOUT the journal
    }
  }
```

### The exact mechanism that produced the 13 KD

1. A wallet operation (absorption / subscription gift / refund) runs inside a
   business `$transaction`. It writes `TransactionHistory` and updates
   `CustomerWallet.balance` — **these succeed**.
2. In the same transaction it calls e.g. `appendWalletAbsorptionEntrySafe(...)`
   (DR `WALLET_LIABILITY` / CR `REVENUE`) or `appendSubscriptionRefundEntrySafe`.
3. The journal write throws (a seeded-account lookup miss, a transient DB
   error, a serialization conflict, etc.).
4. The `*Safe` wrapper **swallows** the error, persists a `JournalFailureLog`
   row on a *separate* Prisma client (so it survives even a rollback),
   `return null`.
5. The business transaction **commits**: the wallet balance moved, but
   `WALLET_LIABILITY` in the journal did **not**.

Result: `Σ Journal.WALLET_LIABILITY (credit − debit)` is now **less** than
`Σ CustomerWallet.balance` by exactly the dropped amount → a `WALLET_LIABILITY`
drift. With trial data this surfaced as ~13 KD on a single customer.

### Why only "under"-journaling (and not over)

`appendBalanced` is idempotent on `sourceRef`, so retries can never *double*
post. The only asymmetry is a **dropped** post → drift is always in the
"ledger has less than the read-model" direction, which matches the observed
13 KD.

### The partial fix that was already in flight

A fail-**closed** switch (`JOURNAL_FAIL_CLOSED_CRITICAL`) was later added — but:

- It defaults **OFF**. The locked contract test asserts it:

```123:135:src/general-ledger/double-entry-journal-fail-closed-critical.spec.ts
    it('flag UNSET behaves like OFF (default fail-open)', async () => {
      delete process.env[FLAG];
      ...
      expect(result).toBeNull();
    });
```

- It only covers **2 of the wrappers** (`appendExternalPaymentEntrySafe`,
  `appendInvoiceIssuanceEntrySafe`). The **wallet / subscription-refund /
  debt-discount / invoice-cancellation** wrappers — precisely the ones that
  move `WALLET_LIABILITY` — remained fail-open even when the flag was on.

So in the default production configuration, the drift could still happen, and
the wallet-liability path was never covered by the fail-closed switch at all.

---

## 4. Path-by-path findings

| Path | Writer | Can create drift? | Notes |
|------|--------|-------------------|-------|
| **Journal Entries** | `appendBalanced` | No | Strict balance + idempotency. Internally safe. |
| **Journal Lines** | nested `create` | No | Generated by `appendBalanced`; never written directly by app code. |
| **Ledger Updates** | per-account aggregation | No (read) | Balances are *derived* from journal lines, not stored, so they can't drift on their own — but they faithfully reflect a *missing* entry. |
| **Reversal Logic** | `appendInvoiceCancellationEntry`, `appendSubscriptionRefundEntry` | Yes (fail-open) | Deterministic `sourceRef` → no *double* reversal. But the `*Safe` form could drop the reversal entry (fail-open). |
| **Adjustments** | `mirrorDebtLedgerEntry` (`ADJUSTMENT`) | Yes (fail-open) | Same swallow path. |
| **Deposits** | cash custody / bank deposit | No journal coupling | Cash reconciliation is separate (`AccountingReconciliationService`); not the 13 KD source. |
| **Payments** | `appendExternalPaymentEntrySafe` | Yes (fail-open by default) | Covered by the fail-closed flag **only when enabled**. |
| **Wallet Settlements** | `appendWalletAbsorptionEntry(V3)Safe` | **Yes — primary suspect** | DR `WALLET_LIABILITY`; fail-open and **not** covered by the fail-closed flag. |
| **Subscription Accounting** | `appendSubscriptionRefundEntrySafe`, activation accrual | **Yes** | Gift removal / cash refund both DR `WALLET_LIABILITY`; fail-open. |
| **Debt Transfers** | `appendDebtDiscountEntrySafe` | Yes (fail-open) | Goodwill writedown; fail-open. |

The intersection of "moves `WALLET_LIABILITY`" **and** "fail-open and not
covered by the flag" is exactly **wallet settlement + subscription refund** —
which is consistent with the observed `WALLET_LIABILITY` drift.

---

## 5. Why it was not detected early

The capability to detect this **already exists** but was effectively switched
off on every axis:

1. **The right invariant exists but the cron is disabled.**
   `ReconciliationService.checkWalletLiabilityMatch()` compares
   `Σ Journal.WALLET_LIABILITY` to `Σ CustomerWallet.balance` — the exact 13 KD
   check. But the cron self-disables:

```169:175:src/finance/reconciliation/reconciliation.service.ts
  private isCronEnabled(): boolean {
    const v = (process.env.RECONCILIATION_CRON_ENABLED ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }
```

2. **Drift events are emitted but nobody listens for alerting.**
   `runOnce()` emits `finance.drift.detected` per failing invariant, but the
   only `finance.*` listener is the snapshot refresher, which **ignores** any
   event without a `customerId` — and the drift payload has none:

```55:58:src/domain-events/handlers/financial-snapshot.listener.ts
  @OnEvent('finance.*', { async: true })
  handle(event: FinancialDomainEvent): void {
    if (!event?.payload?.customerId) return;
```

   → No owner alert, no Discord, no audit log was ever produced from a drift.

3. **The circuit breaker is per-customer and threshold-based.**
   `tripBreakerIfNeeded` only throws after **> CRITICAL_FAILURE_THRESHOLD**
   failures for the **same** customer within a short window. A *single*
   isolated drop (like the 13 KD) is below threshold and slips through
   silently.

4. **`JournalFailureLog` is written but never auto-reconciled.**
   Every dropped journal leaves a forensic row, but nothing reads that backlog
   on a schedule and alerts. It was a black box flight recorder with no alarm.

5. **No owner-facing accounting-health surface.**
   There was no `GET /owner/accounting-health` and no daily integrity report, so
   the owner had no way to see "ledger ≠ wallet" until someone manually ran a
   query.

---

## 6. Missing protections (the gap list this hardening closes)

| # | Missing protection | Closed by |
|---|--------------------|-----------|
| 1 | Atomic journaling for **all** money-movement wrappers (not just 2) | Fail-closed coverage extended to every `*Safe` wrapper (flag-gated, default unchanged), + production runbook to enable `JOURNAL_FAIL_CLOSED_CRITICAL=true`. |
| 2 | A reusable, explicit integrity guard usable by any financial service | `FinancialIntegrityService` (`assertEntryBalanced`, duplicate/double-settlement/double-reversal/negative-balance checks) — hard-fail, no partial success. |
| 3 | DB-level guarantee that an imbalanced/negative entry **cannot** be committed by *any* API or script | Deferrable per-entry balance **constraint trigger** + non-negative / non-ambiguous **CHECK** constraints on `JournalLine`. |
| 4 | Always-on detection that catches a *missing* entry (drift) | Daily reconciliation job (always-on outside tests) reusing the 5 existing invariants + per-entry balance + audit-chain + failure backlog. |
| 5 | Owner-visible health status | `GET /owner/accounting-health` returning `HEALTHY / WARNING / CRITICAL`. |
| 6 | Alerting on drift / unbalanced entry / broken chain | `finance.drift.detected` and the daily report now raise **System + Security alerts + Audit Log** and surface in the Owner Command Center. |
| 7 | A persisted, auditable daily record | `DailyAccountingIntegrityReport` table + audit-log entry per run. |

---

## 7. Can the 13 KD class recur after this hardening?

- **Imbalanced or negative entry:** *impossible* — rejected by the DB constraint
  trigger and CHECK constraints regardless of how the write is attempted.
- **Duplicate / double posting:** *impossible* — unique `sourceRef` + idempotent
  `appendBalanced` + explicit duplicate guard.
- **Missing entry (the 13 KD class):**
  - *Prevented* when `JOURNAL_FAIL_CLOSED_CRITICAL=true` (now covers every
    money wrapper) — the journal failure rolls back the balance change, so no
    partial success is possible.
  - *Detected within 24h and alerted* even if fail-closed is off — the
    always-on daily reconciliation compares ledger vs wallet/snapshot and raises
    owner + security alerts plus an audit log, instead of sitting silent.

The residual risk and the exact remaining-risk matrix are quantified in
[`docs/FINANCIAL_HARDENING_REPORT.md`](./FINANCIAL_HARDENING_REPORT.md).
