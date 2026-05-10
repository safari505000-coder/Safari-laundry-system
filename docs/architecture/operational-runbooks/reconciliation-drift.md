# Runbook — Reconciliation drift handling

> When `ReconciliationService` reports DRIFT > 0 on any of the four
> identities (trial balance, balance sheet, debt == AR, wallet
> liability match) — this is a **P1 incident**.

## 1. Symptoms

- Discord channel `#alerts-financial` shows
  `[RECONCILIATION_DRIFT]` log line OR `finance.reconciliation.failed`
  event with `severity: ERROR | CRITICAL`.
- `reconciliation_drift_total` counter incremented.
- `ReconciliationRun` row in DB with `status = DRIFT`.
- Customer 360 / Subscribers / Outstanding pages show numbers that
  contradict the journal.

## 2. Triage (≤ 10 min)

```bash
# Get the latest reconciliation run details
psql "$DATABASE_URL" -c "
  SELECT id, \"runStartedAt\", \"runFinishedAt\", status,
         \"checkTrialBalancePassed\",
         \"checkBalanceSheetPassed\",
         \"checkArIntegrityPassed\",
         \"checkWalletLiabilityPassed\",
         \"trialBalanceDeltaKd\",
         \"balanceSheetDeltaKd\",
         \"arIntegrityDeltaKd\",
         \"walletLiabilityDeltaKd\"
  FROM \"ReconciliationRun\"
  ORDER BY \"runStartedAt\" DESC LIMIT 1;
"
```

Identify which identity failed:

| Identity | Likely cause |
| --- | --- |
| Trial balance (Σ DR ≠ Σ CR) | Direct journal write that bypassed `appendBalanced`. **Critical.** |
| Balance sheet (A ≠ L + E) | Same — direct journal write OR wrong account class assignment. |
| AR integrity (`debt ≠ AR`) | Legacy GL mirror drifted. OR a `DebtLedgerEntry` was inserted without a matching `JournalEntry`. |
| Wallet liability match (orphan absorptions) | A wallet absorption journal entry exists without its `WALLET_ABSORB:<orderId>` mate. |

## 3. Containment

### Step 3.1 — Freeze new financial mutations

If the drift is GROWING (compare to last run), stop new writes:

```bash
# Set the read-only env flag for the API
kubectl -n production set env deploy/safari-erp READ_ONLY_FINANCIAL=true
kubectl -n production rollout restart deploy/safari-erp
```

This causes every write path to throw `READ_ONLY_FINANCIAL_MODE`
before `appendBalanced` is called. POS, payment finalize, custody
handover all return 503 with a clear message. Reads continue.

> **Communicate immediately** to the call-centre supervisor and ops
> manager that POS is paused. Customer-facing payment links will
> fail; cash + KNET handheld will fail.

### Step 3.2 — Identify the bad write

```bash
# Find journal entries with non-zero net (per entry)
psql "$DATABASE_URL" -c "
  SELECT je.id, je.\"sourceRef\", je.\"createdAt\",
         SUM(jl.debit) AS sum_dr, SUM(jl.credit) AS sum_cr,
         (SUM(jl.debit) - SUM(jl.credit)) AS delta
  FROM \"JournalEntry\" je
  JOIN \"JournalLine\" jl ON jl.\"entryId\" = je.id
  WHERE je.\"createdAt\" > NOW() - INTERVAL '24 hours'
  GROUP BY je.id
  HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.001
  ORDER BY je.\"createdAt\" DESC;
"
```

Any rows here are **direct journal writes that bypassed
`appendBalanced`** — that is the source of the drift.

If no per-entry imbalance is found but trial balance is off, the
imbalance is across entries. Check for:

- `DebtLedgerEntry` rows without matching `JournalEntry` (look at
  `sourceRef` correlation).
- `GeneralLedgerEntry` rows that diverged from canonical journal
  (compare `Σ amount` per `(customerId, entryType)`).

### Step 3.3 — Decide: REVERSE or REBUILD

| Drift size | Action |
| --- | --- |
| Single entry, ≤ 10 KD | Reverse via canonical reversal: `journal.reverseEntry(<sourceRef>, <reason>)`. |
| Multiple entries, < 100 KD | Reverse each via canonical reversal. |
| Many entries OR large amount | Escalate to architect. **Do not reverse blindly.** |

Reversal recipe (idempotent, audit-safe):

```ts
// One-off script — run via a dedicated admin endpoint, not psql
await journal.reverseEntry('PAYMENT:abc123', 'manual reversal — incident #1234');
```

### Step 3.4 — Rebuild snapshots

After reversals, projections drift from the journal. Force
recompute:

```bash
curl -sS -X POST "${BASE}/api/admin/snapshots/rebuild-all" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

Wait for the response (large customer bases take minutes). Confirm
final reconciliation passes:

```bash
curl -sS -X POST "${BASE}/api/finance/reconciliation" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .
```

## 4. Recovery

1. Confirm all four identities pass:
   ```
   "checkTrialBalancePassed": true,
   "checkBalanceSheetPassed": true,
   "checkArIntegrityPassed": true,
   "checkWalletLiabilityPassed": true
   ```
2. Lift the freeze:
   ```bash
   kubectl -n production set env deploy/safari-erp READ_ONLY_FINANCIAL-
   kubectl -n production rollout restart deploy/safari-erp
   ```
3. Notify operations that POS is back online.
4. Keep watching `reconciliation_drift_total` for the next 4 hours.

## 5. Post-incident

- File an incident report with:
  - Timeline of detection, containment, recovery.
  - Root-cause `sourceRef` (the entry that bypassed `appendBalanced`).
  - Reversal `sourceRef` (the contra-entry).
  - Customer impact (count of affected customers / total KD).
- Open a P0 ticket on the team that wrote the bypass.
- Add a regression test that asserts the bypass throws.
- Update [`../invariants.md`](../invariants.md) if a new invariant
  needs to be enforced to catch this earlier.

## 6. What you must never do

- ❌ Run `UPDATE "JournalEntry" SET …` to "fix" a bad entry.
  **Append-only DB triggers will refuse the write.** If for some
  reason the trigger is missing, this would be a fireable offence.
  Always use a reversal.
- ❌ Run `DELETE FROM "JournalEntry" WHERE …` to remove a bad entry.
  Same — DB triggers refuse. Always use a reversal.
- ❌ Edit `wallet.balance` directly to "match" the journal.
  This compounds the drift. Always reconcile the journal first;
  the snapshot rebuild will recompute the wallet projection from
  truth.
- ❌ Disable reconciliation alerts to "stop the noise" during the
  incident. The alerts are how you measure recovery.
- ❌ Disable the append-only DB triggers. Doing so opens a window
  where any future bug can mutate history without anyone noticing.

## 7. Related

- [`../invariants.md`](../invariants.md) — invariants 1, 2, 3, 4, 7, 10, 11.
- [`../financial-core.md`](../financial-core.md) §3 (reversal-only corrections), §5 (reconciliation pipeline).
- [`../event-map.md`](../event-map.md) — `finance.reconciliation.failed` event.
- [`incident-response.md`](./incident-response.md) — the generic incident-response checklist.
