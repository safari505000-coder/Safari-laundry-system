# V22 Phase 5 — Rollback Guide

**Phase:** V22 Phase 5 (Operator UX Rebuild)
**Audience:** Release engineering
**Risk class:** **Low** — every change is additive and reversible.

---

## 1. Full rollback (one command)

```bash
git revert <V22-PHASE-5-COMMIT-SHA>
git push
# Trigger your CI/CD release pipeline.
```

After revert:

* `/cc/customers/:customerId/360` returns to a 404 (or whatever your shell renders for unknown routes).
* SSE feeds on `cc-customer-360-page`, `cc-dashboard-page`, and `collections-page` are removed.
* Polling fallbacks (10s on dispatch, 30s on summary, 30s on collections) continue to work — they were never removed.
* No backend, no schema, no canonical financial logic was touched. Nothing else changes.

---

## 2. Granular rollbacks

Some teams prefer to keep parts of Phase 5 and revert only specific surfaces. Each block below is independently safe.

### 2.1 Disable Customer360 v2 only (keep all SSE wires)

```bash
# 1) Delete the v2 page file
git rm web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx
git rm web/src/modules/call-center/dashboard/pages/v22-phase5-customer-360-v2-architecture.test.tsx

# 2) In web/src/App.tsx, remove:
#    - the `import { CcCustomer360V2Page } from '@/modules/call-center/dashboard/pages/cc-customer-360-v2-page';` line
#    - the entire <Route path="cc/customers/:customerId/360" …> block

# 3) Run validation
cd web
npx vitest run                   # expect: 174 passed (8 tests removed)
npx tsc -p tsconfig.app.json --noEmit
npx vite build
```

The v1 Customer360 page and its SSE wire remain untouched.

### 2.2 Disable SSE on `cc-customer-360-page.tsx` only

In `web/src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx`, remove:

1. The `useRealtimeFinancialFeed` import line.
2. The `useRealtimeFinancialFeed({...})` block.
3. (Optional) Change `const { user, token } = useAuth();` back to `const { user } = useAuth();` if `token` is no longer used.

Then update the lock-in test (`web/src/modules/finance/state/v22-phase5-realtime-adoption.test.ts`):

* Remove the entry for `'src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx'` from the `ADOPTION_TARGETS` array.

### 2.3 Disable SSE on `cc-dashboard-page.tsx` only

Same procedure as 2.2, applied to `cc-dashboard-page.tsx`. Remove its entry from `ADOPTION_TARGETS`.

### 2.4 Disable SSE on `collections-page.tsx` only

Same procedure as 2.2, applied to `collections-page.tsx`. Remove its entry from `ADOPTION_TARGETS`.

### 2.5 Remove the new operational primitives

Only do this AFTER 2.1 (the v2 page is the only consumer):

```bash
git rm -r web/src/modules/shared/components/operational/
```

Then update `web/src/modules/finance/state/v22-phase5-realtime-adoption.test.ts` and the customer360 v2 architecture test (which is also removed in 2.1).

### 2.6 Remove just the docs

```bash
git rm docs/v22-phase5-*.md
```

The docs are pure documentation; removal has zero runtime effect.

---

## 3. Verification after a granular rollback

Whatever the granularity, always run:

```bash
cd web
npx tsc -p tsconfig.app.json --noEmit
npx vitest run
npx vite build
npx madge --circular --ts-config tsconfig.app.json src

cd ..
npx tsc -p tsconfig.build.json --noEmit
npx jest --testPathPatterns="(v21-phase1-core-freeze|v21-phase4-event-bus-integrity|v21-canonical-banking-guards|domain-events)" --silent
```

The backend test suite must remain at 204/204 since this phase did not touch backend code.

---

## 4. Files involved (for reference)

```
ADDED (delete to revert)
├── web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx
├── web/src/modules/call-center/dashboard/pages/v22-phase5-customer-360-v2-architecture.test.tsx
├── web/src/modules/finance/state/v22-phase5-realtime-adoption.test.ts
├── web/src/modules/shared/components/operational/StickyActionBar.tsx
├── web/src/modules/shared/components/operational/SmartActionChip.tsx
├── web/src/modules/shared/components/operational/index.ts
├── web/src/modules/shared/components/operational/v22-phase5-operational-primitives.test.tsx
├── docs/v22-phase5-customer360-rebuild-report.md
├── docs/v22-phase5-collections-workflow-report.md
├── docs/v22-phase5-accounting-ux-report.md
├── docs/v22-phase5-realtime-adoption-validation.md
├── docs/v22-phase5-responsive-validation.md
├── docs/v22-phase5-accessibility-report.md
├── docs/v22-phase5-performance-validation.md
├── docs/v22-phase5-rollout-guide.md
├── docs/v22-phase5-rollback-guide.md
├── docs/v22-phase5-final-operational-ux-scorecard.md
├── docs/v22-phase5-validation.md
└── docs/v22-phase5-implementation.md

MODIFIED (revert the specific hunks)
├── web/src/App.tsx                                                                   (added route + import)
├── web/src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx              (added SSE wire)
├── web/src/modules/call-center/dashboard/pages/cc-dashboard-page.tsx                 (added SSE wire)
└── web/src/modules/call-center/pages/collections-page.tsx                             (added SSE wire)

DELETED in V22 Phase 5
└── (none)
```

---

## 5. Backend invariant guarantee

Reverting V22 Phase 5 — in any granularity — does NOT affect:

* Canonical journal logic (`appendBalanced`, `JournalEntry`, `JournalLine`).
* Settlement orchestration.
* Historical financial rows.
* The append-only event outbox.
* The realtime gateway backend (`FinancialRealtimeGateway`).
* The event bus adapters (in-memory + Kafka/RabbitMQ/Redis Streams stubs).
* The 5 built-in alert rules and observability snapshots.
* The 204 V21 financial guards.

This phase shipped **frontend-only changes**. The rollback envelope is therefore strictly bounded to the four files above.
