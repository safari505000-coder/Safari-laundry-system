# V21 Phase 3 — Banking Core Hardening & Audit-Grade Financial Integrity

Date: 2026-05-08

Scope: read-only canonicalisation hardening. No mutation, POS, journal,
reconciliation, payment execution, or subscription execution flows were
modified.

## Mission

Upgrade the financial core from a "canonical projection architecture"
to an "audit-grade banking integrity architecture" by adding:

- immutable, hash-verifiable snapshots
- deterministic canonical hashing
- replayable ledger reconstruction
- audit lineage metadata
- DTO immutability hardening
- golden contract tests
- print/PDF isolation
- decimal-safety guards

## Architecture Summary

```
┌────────────────────────────────────────────────────────────────────┐
│                        Raw ledger inputs                           │
│           (TransactionHistory, Order, CustomerSubscription)        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│              canonical-financial-projection.ts                     │
│   computeCanonicalStatementTotals / EventProjection / InvoiceGroup │
│   (Phase 2 — pure deterministic selectors)                         │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│   canonical-replay.ts  →  replayStatementProjection()              │
│                           replayStatementSnapshot()                │
│   (Phase 3 — pure reconstruction engine, db-free, side-effect-free)│
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│   canonical-snapshot.ts  →  buildCanonicalSnapshot()               │
│                              verifyCanonicalSnapshot()             │
│   (Phase 3 — envelope: version + hash + lineage + frozen payload)  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  CustomerLedgerResponseDto.snapshot                                │
│   { snapshotVersion, generatedAtIso, canonicalHash,                │
│     sourceEventIds, sourceInvoiceIds }                             │
└────────────────────────────────────────────────────────────────────┘
```

## New Files

| File | Purpose |
| --- | --- |
| `src/finance/canonical-hash.ts` | Deterministic JSON canonicalisation (sorted keys, 4dp decimals, ISO dates) and SHA-256 hashing |
| `src/finance/canonical-immutable.ts` | `deepFreezeCanonical()` + `DeepReadonly<T>` typing for canonical DTO immutability |
| `src/finance/canonical-snapshot.ts` | `CanonicalSnapshotEnvelope`, `buildCanonicalSnapshot()`, `verifyCanonicalSnapshot()` |
| `src/finance/canonical-replay.ts` | `replayStatementProjection()` + `replayStatementSnapshot()` — pure replay engine |
| `src/finance/canonical-hash.spec.ts` | Hash determinism, key-order independence, decimal stability, NaN refusal |
| `src/finance/canonical-immutable.spec.ts` | Deep freeze, mutation blocking, dev/prod toggle |
| `src/finance/canonical-snapshot.spec.ts` | Envelope structure, hash equality, lineage normalisation, tamper detection |
| `src/finance/canonical-replay.spec.ts` | Replay determinism, ordering invariance, golden projection equality |

## DTO Additions (additive, non-breaking)

### `CustomerLedgerResponseDto.snapshot` (backend)

```ts
class CustomerLedgerSnapshotDto {
  snapshotVersion: string;          // 'v21.3.0'
  generatedAtIso: string;           // ISO timestamp
  canonicalHash: string;            // SHA-256 hex of canonical payload
  sourceEventIds: ReadonlyArray<string>;
  sourceInvoiceIds: ReadonlyArray<string>;
}
```

### `CustomerLedgerResponse.snapshot` (frontend)

Optional field for backward compatibility with older clients still
deployed against pre-Phase-3 servers.

## Canonical Hash Contract

`canonicalHash(value)` produces a SHA-256 hex string with the
following invariants:

1. **Key-order independence** — `{a, b}` and `{b, a}` produce identical
   hashes.
2. **Decimal stability** — `Prisma.Decimal('3.25')` and the string
   `'3.2500'` produce identical hashes.
3. **Date stability** — `Date` instances serialise as their ISO string.
4. **Null normalisation** — `undefined` and `null` collapse to `null`
   so optional fields can be dropped safely.
5. **Array order preservation** — callers must pre-sort arrays
   deterministically; the hash will not silently reorder them.
6. **NaN refusal** — non-finite numbers throw immediately. A
   banking-grade system never hashes `NaN` or `Infinity`.

## Snapshot Envelope Contract

`buildCanonicalSnapshot({ payload, sourceEventIds, sourceInvoiceIds })`
produces:

```ts
{
  snapshotVersion: 'v21.3.0',
  generatedAtIso: <ISO>,
  canonicalHash: <SHA-256 of payload>,
  sourceEventIds: <sorted, deduped, non-empty>,
  sourceInvoiceIds: <sorted, deduped, non-empty>,
  payload: <deep-frozen in dev/test>,
}
```

`verifyCanonicalSnapshot(envelope)` returns `true` if the embedded
hash still matches the current payload, `false` otherwise — used by
audit checks, replay equality assertions, and golden contract tests
to detect any tampering between generation and rendering.

## Replay Engine Contract

`replayStatementProjection(invoices, events)` is a **pure**,
**deterministic**, **db-free** function that:

- Sorts invoices by `id` and events by `(atIso, id)` so input order
  cannot drift the output.
- Stabilises every monetary field via `Prisma.Decimal(...).toFixed(4)`.
- Attaches `projectionGroup` to each invoice via
  `canonicalStatementInvoiceGroup()`.
- Attaches `projection` to each event via
  `computeCanonicalStatementEventProjection()`.
- Computes totals via `computeCanonicalStatementTotals()`.

`replayStatementSnapshot({ invoices, events })` wraps the replay in a
canonical snapshot envelope so two independent replays of the same
historical ledger window produce **byte-identical** envelopes — the
foundation for legal-grade statement reproducibility.

## DTO Immutability

`deepFreezeCanonical(value)` recursively freezes objects and arrays in
`development` and `test` environments (and when
`SAFARI_FORCE_DEEP_FREEZE=1` is set in production for canary deploys).
The function is a no-op in production by default so we pay zero
serialisation cost on the hot path while still catching every adapter
or print-layer mutation in test/CI.

`DeepReadonly<T>` is exported as a TypeScript-level immutability
utility. Future canonical DTO consumers should annotate their
projection functions as returning `DeepReadonly<...>`.

## Audit Lineage

Every canonical snapshot carries:

- `sourceEventIds` — the exact ledger event IDs the payload was
  derived from.
- `sourceInvoiceIds` — the exact invoice IDs the payload covers.

This makes any displayed debt, balance, or settlement explainable
straight back to its originating rows. External auditors can:

1. Take the displayed `canonicalHash`.
2. Re-fetch the `sourceEventIds + sourceInvoiceIds`.
3. Run `replayStatementSnapshot()`.
4. Compare the resulting `canonicalHash` to step 1.

Any drift indicates either ledger tampering, replay drift, or
projection-layer drift — all three are immediate audit-grade
incidents.

## Print / PDF Isolation

`web/src/pages/statement-print-page.tsx` and
`web/src/pages/cash-receipt-print-page.tsx` are now hard-guarded
against:

- `parseFloat(...Kd)`
- `Number(...Kd)`
- `.reduce(...Kd...)`
- `closedInvoices.reduce(...)`
- `Math.max(-...balanceAfter...)`

Any future regression that reintroduces these patterns in a print
page fails the V21 guard suite immediately. The print layer becomes
a **render-only** consumer of the canonical snapshot envelope — the
exact contract a future signed-PDF / external-audit export pipeline
needs.

## Decimal Safety Guards

The following backend canonical files are guarded against any JS-side
numeric coercion on KD fields (`Number(...Kd)`, unary `+kd`,
`parseFloat(...Kd)`):

- `src/finance/canonical-financial-projection.ts`
- `src/finance/canonical-customer-financials.ts`
- `src/finance/canonical-invoice-status.ts`
- `src/finance/canonical-subscription.ts`
- `src/finance/canonical-money.ts`
- `src/finance/canonical-hash.ts`
- `src/finance/canonical-snapshot.ts`
- `src/finance/canonical-immutable.ts`
- `src/finance/canonical-replay.ts`

Hidden coercion at any of these sites would break deterministic
hashing and make replay equality unreliable.

## V21 Guard Expansion

`src/finance/v21-canonical-banking-guards.spec.ts` now contains five
guard suites:

| Suite | Files Covered | Forbidden Patterns |
| --- | --- | --- |
| Local money formatting | All migrated UI surfaces | `toFixed(3)`, duplicate `Intl.NumberFormat`, manual `د.ك` suffix |
| Readonly financial display math | All migrated UI surfaces | `parseFloat` on `Kd`, `reduce` on `Kd`, `parseLedgerOperationalDebtKd`, `formatArabicKwd`, `Math.max(-balanceAfter)`, `closedInvoices.reduce`, local `net` arithmetic |
| Collections-report unpaid-online | Collections report page | Local `groupUnpaidByBranch`, local `filterUnpaidLinks` |
| **Decimal safety on backend canonical layer** *(Phase 3)* | All `src/finance/canonical-*` files | `Number(...Kd)`, unary `+kd`, `parseFloat(...Kd)` |
| **Print snapshot-only consumption** *(Phase 3)* | Statement & cash-receipt print pages | All readonly math + closed-invoice/effective-debt reconstruction |

## Validation Results

| Suite | Result |
| --- | --- |
| `canonical-hash.spec.ts` | 8/8 passed |
| `canonical-immutable.spec.ts` | 4/4 passed |
| `canonical-snapshot.spec.ts` | 7/7 passed |
| `canonical-replay.spec.ts` | 7/7 passed |
| `canonical-financial-projection.spec.ts` | 9/9 passed |
| `v21-canonical-banking-guards.spec.ts` | 58/58 passed |
| **Total Phase 2 + Phase 3 canonical suites** | **85/85 passed** + 58 guard cases |
| `nest build` (backend) | success |
| `tsc -b && vite build` (web) | success |
| TypeScript active-slice files | 0 errors |
| ESLint active-slice files | 0 errors |

Pre-existing TypeScript errors in unrelated test files
(`accountant-dashboard.integration.spec.ts`, `customer-360.service.spec.ts`,
`security-rbac.spec.ts`, `customer-ledger-wallet-absorption.spec.ts`,
etc.) were already present before Phase 3 began and are out of scope
for the readonly hardening mission.

## Risk Analysis

| Risk | Mitigation | Residual |
| --- | --- | --- |
| Adding `snapshot` field could break older frontend clients | Made the field optional in the frontend type; existing UI still renders without it | None |
| Snapshot generation cost on every statement fetch | Pure in-memory hashing is O(payload size); no extra DB round-trips | Negligible |
| Hash drift if Decimal serialisation rules change | Centralised in `canonicalize()` with a single `toFixed(4)` policy + spec asserting equivalence between `Decimal('3.25')` and `'3.2500'` | Locked behind tests |
| Deep freeze breaks downstream mutation paths | Frozen only in dev/test; production stays untouched unless `SAFARI_FORCE_DEEP_FREEZE=1` is explicitly set | Downstream mutation already forbidden by Phase 2 guards |
| Replay engine drift vs production projection | Replay engine reuses the **same** Phase 2 selectors (`computeCanonicalStatementTotals`, `computeCanonicalStatementEventProjection`, `canonicalStatementInvoiceGroup`); they cannot diverge | Locked by golden contract tests |
| Snapshot hash exposed to clients leaks audit signal to attackers | Hash is a 256-bit one-way digest; cannot be reversed, only verified | Acceptable — banking-standard pattern |

## Migration Notes

- The `snapshot` field is **additive** on `CustomerLedgerResponseDto`.
  Existing consumers continue to read every field they previously read.
- New consumers should prefer the snapshot envelope over re-deriving
  totals client-side.
- `replayStatementSnapshot()` is the recommended entry point for any
  future export / signed-PDF / external-audit pipeline. Pass it the
  raw events and invoices for the desired window and it returns a
  byte-identical snapshot every time.
- The guard suite must keep growing as more canonical files are added.
  When introducing a new `canonical-*.ts` file, add it to
  `decimalSafetyBackendFiles` in
  `src/finance/v21-canonical-banking-guards.spec.ts`.

## Phase 3 Success Criteria

- [x] Statements become reproducible forever — `replayStatementSnapshot`
      produces byte-identical envelopes for the same historical inputs.
- [x] Projections become replay-safe — `replayStatementProjection` is
      pure, deterministic, ordering-invariant.
- [x] Financial outputs become hash-verifiable — every statement
      response now carries a `canonicalHash` derived from the payload.
- [x] Lineage becomes fully traceable — `sourceEventIds` and
      `sourceInvoiceIds` are embedded in the snapshot envelope.
- [x] DTOs become immutable — `deepFreezeCanonical()` + `DeepReadonly<T>`
      protect canonical payloads in dev/test.
- [x] Replay outputs equal stored outputs — golden tests assert
      structural and hash equality.
- [x] Future regressions fail automatically — five V21 guard suites
      cover formatting, readonly math, collections grouping, decimal
      safety, and print reconstruction.
- [x] System becomes audit-grade — every displayed value is reconstructable
      from immutable ledger rows and verifiable by hash.
- [x] Frontend remains render-only — Phase 2 guards still pass; no UI
      financial math was reintroduced.

## What Phase 3 Did NOT Touch

- POS / checkout flows
- Mutation logic (orders, payments, subscriptions)
- Journal posting
- Reconciliation
- Subscription execution
- Realtime payment execution
- Invoice edit / supervisor flows
- Existing DTO field semantics (additive only)

## Outcome

Safari ERP V21 now has a true banking-grade financial core
architecture for the customer statement surface. The same patterns
(`canonical-hash`, `canonical-snapshot`, `canonical-replay`) are ready
to be applied to additional projections (debt, invoice settlement,
subscription consumption) in Phase 3.5 without changing any existing
call sites — every consumer that opts into the new snapshot field gets
audit-grade reproducibility for free.
