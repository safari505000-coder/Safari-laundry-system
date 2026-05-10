# V20.8.1.1 — Journal ↔ DebtLedger Drift Scan

**Generated:** 2026-05-07T20:23:18.789Z
**Scope:** all customers
**Scanned:** 9 customer(s) in 6344 ms
**Tolerance:** 0.001 KD (matches `assertJournalLedgerLockstepTx` runtime guard)

## Summary

- Customers with drift > tolerance: **2**
- Total absolute drift across all customers: **12.1000 KD**
- Direction `overpayment_in_journal` (journal AR < ledger; AR has phantom credits): **2**
- Direction `underpayment_in_journal` (journal AR > ledger; AR has phantom debits): **0**

## Affected customers (sorted by drift, descending)

| # | Customer | Phone | Δ KD | Direction | LedgerNet | JournalAR | DR / CR rows |
|---|---|---|---:|---|---:|---:|---|
| 1 | ثامر دسوقي `ef6d0a01-0da9-4e08-9374-553eb8326140` | 97200554 | 8.8500 | overpayment_in_journal | 0.0000 | -8.8500 | 4 / 8 |
| 2 | زياد `70fd082c-ace7-41e7-a7d3-4266ef0daaea` | 94440825 | 3.2500 | overpayment_in_journal | 0.0000 | -3.2500 | 1 / 1 |

## Detailed breakdown (LedgerNet inputs)

| Customer | INVOICE_SHORTFALL Σ | SUBSCRIPTION_OVERUSE Σ | real PAYMENT Σ |
|---|---:|---:|---:|
| `ef6d0a01-0da9-4e08-9374-553eb8326140` | 12.8000 | 0.0000 | 21.6500 |
| `70fd082c-ace7-41e7-a7d3-4266ef0daaea` | 3.2500 | 0.0000 | 6.5000 |

## Repair plan (next step — REQUIRES OPERATOR APPROVAL)

For each `overpayment_in_journal` customer:

1. Issue a compensating `JournalEntry`:
     - DR account 1300 (Accounts Receivable) = delta
     - CR account 1100 (Cash / Wallet)        = delta
   …with `entryType = DEBT_ADJUSTMENT`, `sourceRef = "V20_8_1_1:DRIFT_REPAIR:<customerId>"`, and a memo explaining it is a historical wallet-leak repair.
2. Re-run this scanner; expect `delta = 0.0000` for the repaired customer.
3. Re-attempt the POS checkout that was previously rejected.

For each `underpayment_in_journal` customer (reversed direction): mirror the entry (DR Cash / CR AR).

No historical journal rows are mutated; the repair is a NEW append-only entry. The runtime guard `assertJournalLedgerLockstepTx` will then accept further wallet absorptions on the customer.
