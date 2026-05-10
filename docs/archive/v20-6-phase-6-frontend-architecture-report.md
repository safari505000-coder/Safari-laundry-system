# V20.6 — Phase 6: Frontend Financial Architecture Rebuild

> **Status:** ✅ **PASSED** — 42/42 frontend tests, frontend `tsc -b` clean, 191/191 backend finance/general-ledger/domain-events tests still green (1 pre-existing unrelated security-rbac failure baseline-confirmed).

This document records every architectural decision, file added, invariant introduced, and validation step executed for Phase 6 of V20.6: **Frontend Financial Architecture Rebuild** (sub-phases 6A → 6D).

---

## 1. Architecture explanation

V20.4/V20.5 made the **server** banking-grade (canonical journal, append-only history, reversal-only corrections, idempotent writes, observability). Phase 6 makes the **frontend** match that bar by introducing four orthogonal hardening layers:

| Sub-phase | Hardening layer | Result |
| --- | --- | --- |
| 6A | **Feature module architecture** | One folder per business domain; barrel exports gate cross-module access; READMEs codify conventions |
| 6B | **Unified Financial UI Kit** | 12 financial primitives with consistent colour, ARIA, dark-mode, and tabular-num formatting |
| 6C | **State management hardening** | Lightweight in-house TanStack-Query-shaped cache (`FinancialCache`) — normalized keys, per-key dedupe, prefix invalidation, optimistic updates |
| 6D | **Performance hardening** | Fixed-row `WindowedList` virtualization; designed for 100K-row datasets without dropping frames |

The kit and the cache form a **closed loop**: every UI Kit consumer fetches via a `useFinancialQuery` hook and every mutation invalidates by prefix → all surfaces refresh atomically. This eliminates the Phase 5-class drift risk on the client side.

---

## 2. Invariants enforced

| # | Invariant | Mechanism |
| --- | --- | --- |
| F-1 | **No client-side debt math.** Frontend always renders server-canonical numbers verbatim. | `DebtCard`, `MoneyFlowCard`, `JournalEntryView` only accept pre-aggregated DTO fields — no division, no totals reconstructed |
| F-2 | **One in-flight fetch per cache key.** Concurrent screens never trigger duplicate HTTP calls for the same query. | `FinancialCache.fetch()` keeps `inflight: Promise<T>` on the entry and returns the same promise to subsequent callers |
| F-3 | **Prefix invalidation cascades.** A debt mutation invalidates every `finance:debt:cust_X:*` consumer atomically. | `FinancialCache.invalidate(prefix)` walks the store and notifies subscribers |
| F-4 | **Subscriber failure isolation.** A bug in one subscriber cannot break others sharing the same key. | `FinancialCache.notify` wraps each `sub()` in `try/catch` |
| F-5 | **No deep imports across modules.** Domain modules expose a single `index.ts` surface. | Documented in every module README; lint can be added later |
| F-6 | **Balanced ledger view enforced visually.** `JournalEntryView` only shows ✓ when Σ Debit ≈ Σ Credit (≤ 0.0005 KD tolerance). | Footer label switches to `OUT OF BALANCE` otherwise |
| F-7 | **Virtualized lists do not blow up the DOM.** A 100K-row dataset renders ≤ 20 DOM rows + an overscan window. | `WindowedList` slice math + `windowed-list.test.tsx` assertion on `.length` |

---

## 3. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `FinancialCache` is in-house and not battle-tested like TanStack Query. | MEDIUM | Hook signature is intentionally a 1-for-1 swap; the migration is purely a `useFinancialQuery → useQuery` rename when the team is ready. Coverage is locked by the 8-test cache suite. |
| Tailwind class strings inside the UI Kit can be visually inconsistent over time. | LOW | Every primitive is a pure function of its props; visual regression suite (Storybook / Chromatic) is the natural follow-up — out of scope for V20.6. |
| `WindowedList` assumes a constant row height. | LOW | Documented in the file header. If a future surface needs variable heights, we'll swap in `@tanstack/react-virtual` — the props line up. |
| Module READMEs are conventions, not enforced by tooling. | LOW | A future ESLint rule (`no-restricted-imports`) can enforce barrel-only access; the `index.ts` files are already in place to flip the switch. |

---

## 4. Exact files changed

### New files

| Path | Purpose |
| --- | --- |
| `web/src/modules/finance/README.md` | Module charter |
| `web/src/modules/finance/index.ts` | Single barrel surface |
| `web/src/modules/finance/state/financial-cache.ts` | Lightweight TanStack-shaped cache |
| `web/src/modules/finance/state/financial-cache.test.ts` | 8 tests — keyOf, dedupe, invalidate, optimistic, isolation |
| `web/src/modules/finance/components/index.ts` | UI Kit barrel |
| `web/src/modules/finance/components/AgingBadge.tsx` | UI Kit primitive |
| `web/src/modules/finance/components/RiskBadge.tsx` | UI Kit primitive |
| `web/src/modules/finance/components/FraudBadge.tsx` | UI Kit primitive |
| `web/src/modules/finance/components/CollectionsStageBadge.tsx` | UI Kit primitive |
| `web/src/modules/finance/components/PromiseStatusBadge.tsx` | UI Kit primitive |
| `web/src/modules/finance/components/DebtCard.tsx` | UI Kit hero card |
| `web/src/modules/finance/components/TimelineCard.tsx` | UI Kit timeline row |
| `web/src/modules/finance/components/JournalEntryView.tsx` | UI Kit ledger view |
| `web/src/modules/finance/components/ReconciliationStatus.tsx` | UI Kit reconciliation pill |
| `web/src/modules/finance/components/MoneyFlowCard.tsx` | UI Kit cash-flow widget |
| `web/src/modules/finance/components/FinancialHealthIndicator.tsx` | UI Kit health pill (consumes `/observability/overview`) |
| `web/src/modules/finance/components/WindowedList.tsx` | Phase 6D virtualization primitive |
| `web/src/modules/finance/components/financial-ui-kit.test.tsx` | 13 tests — every UI Kit primitive |
| `web/src/modules/finance/components/windowed-list.test.tsx` | 3 tests — virtualization slicing + a11y + empty state |
| `web/src/modules/finance/api/observability-api.ts` | Typed client for Phase 3's HTTP surface |
| `web/src/modules/finance/hooks/use-financial-observability.ts` | Cache-backed hooks per endpoint |
| `web/src/modules/collections/README.md` | Sibling module charter |
| `web/src/modules/customer360/README.md` | Sibling module charter |
| `web/src/modules/risk/README.md` | Sibling module charter |
| `web/src/modules/fraud/README.md` | Sibling module charter |
| `web/src/modules/accounting/README.md` | Sibling module charter |
| `web/src/modules/dashboards/README.md` | Sibling module charter |
| `web/src/modules/shared/README.md` | Updated rule of thumb |

### Modified files

None outside `web/src/modules/`. **Zero touches to backend code or to existing frontend pages — Phase 6 is strictly additive.**

---

## 5. Migrations

None — Phase 6 is **frontend-only**. No Prisma migration, no SQL change.

---

## 6. APIs added

No new HTTP endpoints. Phase 6 layers a typed **client** over the four endpoints introduced in Phase 3:

| Hook | Endpoint | Default stale window |
| --- | --- | --- |
| `useObservabilityOverview(token, windowHours?, staleMs?)` | `GET /api/finance/observability/overview` | 30 s |
| `useObservabilityDrift(token, windowHours?, staleMs?)` | `GET /api/finance/observability/drift` | 60 s |
| `useObservabilityReconciliation(token, staleMs?)` | `GET /api/finance/observability/reconciliation` | 60 s |
| `useObservabilityPerformance(token, windowHours?, staleMs?)` | `GET /api/finance/observability/performance` | 60 s |

---

## 7. Tests added

| Suite | Count | Focus |
| --- | --- | --- |
| `state/financial-cache.test.ts` | 8 | keyOf, sync read, optimistic updater, fetch dedupe, fetch failure, prefix invalidate, subscriber notify, subscriber error isolation |
| `components/financial-ui-kit.test.tsx` | 13 | every UI Kit primitive: aria-label, badge variants, click-as-button, balanced/unbalanced ledger, drift pulse, score clamping |
| `components/windowed-list.test.tsx` | 3 | virtualization slicing (100K rows ⇒ ≤ 20 DOM rows), aria-rowcount, empty-state |
| **Total** | **24** | — |

Combined with the 18 pre-existing frontend tests: **42/42 frontend tests pass.**

---

## 8. Concurrency validation

- `FinancialCache.fetch()` test #4 fires three concurrent reads of the same key with a single `vi.fn` and asserts the fetcher is invoked **once**. This proves the dedupe contract under contention.
- `WindowedList.onScroll` is `requestAnimationFrame`-coalesced — at most one `setState` per frame regardless of scroll velocity, so concurrent wheel events never produce a render storm.

---

## 9. Idempotency validation

- `setQueryData(key, sameValue)` mutates the entry but always notifies — observers get a single re-render per call. No drift between consumers.
- `invalidate(prefix)` is idempotent: invalidating a key already at `fetchedAt = 0` returns the same count and triggers the same notifies, with no side effect on data.
- The cache **cannot** invent data — every entry's `data` is either `undefined`, the result of a `setQueryData`, or the resolved value of `fetch(fetcher)`.

---

## 10. Drift validation

- Cache entries store `error` as a separate field, so a failed fetch never poisons cached data.
- `fetchedAt = 0` after `invalidate` forces the next read to refetch — there is no path where stale data is returned silently.
- `JournalEntryView` visually flags `OUT OF BALANCE` with a 0.0005 KD tolerance — any client-side row aggregation drift surfaces immediately.

---

## 11. Rollout plan

1. **Adopters opt in.** Existing pages keep using their current ad-hoc fetchers and components; no flag day. Phase 7 (Collections Workspace) will be the first consumer.
2. **Topbar pill.** `FinancialHealthIndicator` can be wired into the global topbar in a follow-up small PR — it's already cache-backed.
3. **New screens.** Any new financial screen MUST consume the UI Kit + `useFinancialQuery`; this becomes a code-review checklist item.
4. **Migration of legacy pages.** Done opportunistically when a screen is touched for any other reason. No big-bang rewrite.

---

## 12. Rollback plan

Phase 6 is **purely additive frontend**. Rollback strategy:

1. Delete `web/src/modules/finance/`, `collections/README.md`, `customer360/README.md`, `risk/README.md`, `fraud/README.md`, `accounting/README.md`, `dashboards/README.md`.
2. Re-run `npx tsc -b` and `npx vitest run` — no other surface depends on Phase 6 code.

No DB rollback. No backend code touched. No existing import path broken.

---

## 13. Validation log

```
$ npx vitest run --reporter=default
 Test Files  6 passed (6)
      Tests  42 passed (42)

$ npx tsc -b --pretty false
(exit 0, no output)

$ npx jest --testPathPatterns="(finance|general-ledger|domain-events)"
Test Suites: 29 passed, 29 total
Tests:       21 skipped, 191 passed, 212 total
```

The single backend test failure surfaced by the full `npx jest` run (`security-rbac.spec.ts:134` — `path="/403"` substring missing in `web/src/App.tsx`) is **pre-existing**, confirmed by re-running the same test against `git stash`-ed HEAD (no Phase 6 changes present).

---

## 14. What Phase 6 unlocks for Phase 7

- The Call Center can compose `DebtCard + AgingBadge + RiskBadge + PromiseStatusBadge + TimelineCard + WindowedList` into the Collections Operations Workspace.
- `FinancialHealthIndicator` slots into the workspace topbar.
- `useObservabilityOverview` powers the workspace's KPI strip.
- `useFinancialQuery` becomes the only fetch primitive used inside the workspace, so a payment captured anywhere in the system invalidates `finance:debt:*` and the workspace updates without any custom invalidation glue.

Phase 7 starts now.
