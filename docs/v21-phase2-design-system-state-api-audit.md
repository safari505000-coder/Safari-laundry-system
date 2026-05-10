# V21 — PHASE 2 — DESIGN SYSTEM / STATE / API AUDIT

> Sub-audit of Phase 2 covering objectives 3 (Design System
> Consolidation), 4 (State + Cache Normalization), and 5 (API
> Layer Consolidation). The verdict for all three: **already
> consolidated by V20.7-V20.9**, V21 Phase 1 added the
> cross-module guard, this phase verifies status quo holds and
> adds one new build-fail guard.

---

## 1 — Design System Consolidation

### 1.1 Canonical UI primitives (`web/src/modules/finance/components/`)

| Primitive class | Canonical component | Location |
|-----------------|---------------------|----------|
| Badge          | `AgingBadge`, `BranchBadge`, `CollectionsStageBadge`, `FraudBadge`, `PromiseStatusBadge`, `RiskBadge` | `modules/finance/components/` |
| KPI card       | `KPIWidget`, `FinancialStatCard` | `modules/finance/components/` |
| Tables         | `OutstandingTable`, `WindowedList` (virtual), `windowed-list.perf.test.tsx` | `modules/finance/components/` |
| Skeletons      | `Skeleton`, `skeleton-helpers.tsx` | `modules/finance/components/`, `modules/shared/components/ui/` |
| Empty states   | `EmptyState` | `modules/finance/components/` |
| Timeline cards | `TimelineCard`, `FinancialTimeline` | `modules/finance/components/` |
| Status chips   | `PaymentStatusChip`, `payment-status-chip.tsx` | `modules/finance/components/`, `modules/shared/components/finance/` |
| Headers        | `CustomerFinancialHeader` | `modules/finance/components/` |
| Cards          | `Card`, `CardHeader`, `CardTitle`, `CardContent` | `modules/shared/components/ui/card.tsx` (single canonical card) |
| Money widgets  | `MoneyFlowCard`, `DebtCard`, `Customer360FinancialBreakdown` | `modules/finance/components/` |
| Health         | `FinancialHealthIndicator`, `RiskIndicator`, `ReconciliationStatus` | `modules/finance/components/` |
| Boundary       | `FinancialErrorBoundary` | `modules/finance/components/` |
| Bulk action    | `BulkActionBar` | `modules/finance/components/` |
| Shortcut help  | `KeyboardShortcutHelp` | `modules/finance/components/` |

### 1.2 Duplicate primitive scan

```
$ Glob web/src/modules/**/components/{Badge,Skeleton,EmptyState,Card,KPI*,Table*}.tsx
```

**Result**: zero duplicates. Every primitive name resolves to a
single file. The V20.8 component-consolidation final report (24
files removed) closed every overlap.

### 1.3 Locked-in by

- `web/src/modules/finance/components/v20-7-design-system.test.tsx` — 12 tests
- `web/src/modules/finance/components/v20-7-ui-consistency.test.ts`
- `web/src/modules/finance/components/v20-7-ux-polish.test.tsx`
- `web/src/modules/finance/components/v20-8-component-consolidation.test.ts`
- `web/src/modules/finance/components/v20-8-ui-consistency-expanded.test.ts` (ENFORCED_KD_MATH_ROOTS scan)
- `web/src/modules/finance/components/v20-8-1-financial-breakdown.test.tsx`
- `web/src/modules/finance/components/financial-ui-kit.test.tsx` — 11 tests
- `web/src/modules/shared/components/command/v20-9-command-palette.test.tsx` — 7 tests

**Verdict**: ✅ Design system **fully normalized**. No action
needed in Phase 2.

---

## 2 — State + Cache Normalization

### 2.1 Canonical cache ownership

| Concern | Owner module | File |
|---------|--------------|------|
| Financial query cache | `modules/finance` | `state/financial-cache.ts` |
| Realtime feed         | `modules/finance` | `state/financial-realtime.ts`, `state/financial-realtime-feed.ts` |
| Mutation orchestration| `modules/finance` | `state/financial-mutation.ts` |
| Module-internal       | each module       | `modules/<m>/state/`, `modules/<m>/hooks/` |

### 2.2 Cross-module state leakage scan

V21 Phase 1 added `web/src/modules/finance/cross-module-import-guard.test.ts`
which forbids any non-finance module from deep-importing
`@/modules/finance/state/*`, `…/api/*`, or `…/hooks/*`. The
test passes (verified in Phase 1 validation).

### 2.3 Locked-in by

- `web/src/modules/finance/state/v20-8-state-consolidation.test.ts`
- `web/src/modules/finance/state/v20-8-no-direct-fetch.test.ts` — **4 tests**: forbids direct `fetch(` outside the canonical channel
- `web/src/modules/finance/state/v20-8-performance.test.tsx`
- `web/src/modules/finance/state/v20-9-realtime-feed.test.ts`
- `web/src/modules/finance/state/financial-cache.test.ts` — **8 tests**
- `web/src/modules/finance/state/financial-mutation.test.ts`
- `web/src/modules/finance/cross-module-import-guard.test.ts` — **2 tests** (V21 Phase 1)

**Verdict**: ✅ State + cache **fully normalized**. No action
needed in Phase 2.

---

## 3 — API Layer Consolidation

### 3.1 Direct `fetch(` audit

```
$ rg "\bfetch\(" web/src --type ts --type tsx -l
```

All matches resolve to one of:

| File | Justification |
|------|---------------|
| `web/src/lib/api.ts` | The canonical god-file API client (pre-V20.7 baseline; splitting is a V22 candidate) |
| `web/src/modules/call-center/outstanding/api/outstanding-api.ts` | V20.8-compliant typed module API client |
| `web/src/modules/finance/state/financial-cache.ts` | Internal fetch inside the canonical financial cache |
| `web/src/offline/flush-queue.ts` | Offline retry queue (legitimate) |
| Test files (`*.test.ts`) | Test fixtures |

**Zero undisciplined direct fetch calls outside the approved channels.**

### 3.2 Locked-in by

- `web/src/modules/finance/state/v20-8-no-direct-fetch.test.ts`

### 3.3 Module API client pattern

The expected pattern for new modules:

```ts
// ✅ web/src/modules/<m>/api/<m>-api.ts — typed client
export async function getXyz(token: string): Promise<XyzResponse> {
  return apiJson<XyzResponse>('/api/xyz', { token });
}

// ✅ web/src/modules/<m>/hooks/use-xyz.ts — canonical hook
export function useXyz() {
  return useQuery({
    queryKey: financialQueryKeys.xyz(),
    queryFn: () => getXyz(token),
    staleTime: 30_000,
  });
}
```

`outstanding-api.ts` exemplifies the pattern.

**Verdict**: ✅ API layer **fully consolidated**. No action
needed in Phase 2 beyond locking in the existing pattern.

---

## 4 — Phase 2 net-new addition

A single new build-fail guard is added in `docs/v21-phase2-implementation.md §4`
to lock in **two** invariants that were verified above but
previously had no dedicated test:

1. **No undisciplined `fetch(` outside the approved channel** — the
   V20.8 guard test `v20-8-no-direct-fetch.test.ts` covers
   `modules/finance/`; the new guard extends it to the entire
   `web/src/` tree (excluding `lib/api.ts`, `offline/flush-queue.ts`,
   approved typed clients, and test files).
2. **No `web/src/modules/callcenter/` resurrection** — the
   placeholder folder removed in Wave 2 must not silently
   reappear as a side-effect of a bad rename.

See `v21-phase2-implementation.md §4` for the spec.
