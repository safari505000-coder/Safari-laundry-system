# V21 Phase 4 — Rollback Guide

> Per-wave rollback procedures for everything Phase 4 added or
> recommended.

---

## 1 — Phase 4 itself (this PR)

Phase 4 added zero production code. All additions are:

  * `docs/v21-phase4-*.md` (8 documentation files)
  * `src/domain-events/v21-phase4-event-bus-integrity.spec.ts` (test file)
  * `web/src/modules/finance/state/v21-phase4-realtime-purity.test.ts` (test file)

Rollback is therefore additive and reversible:

```pwsh
# 1. Remove the documentation
git rm docs/v21-phase4-realtime-audit.md `
       docs/v21-phase4-event-architecture-report.md `
       docs/v21-phase4-observability-report.md `
       docs/v21-phase4-replay-safety-validation.md `
       docs/v21-phase4-concurrency-validation.md `
       docs/v21-phase4-performance-validation.md `
       docs/v21-phase4-rollout-guide.md `
       docs/v21-phase4-rollback-guide.md `
       docs/v21-phase4-readiness-scorecard.md

# 2. Remove the integrity guards
git rm src/domain-events/v21-phase4-event-bus-integrity.spec.ts
git rm web/src/modules/finance/state/v21-phase4-realtime-purity.test.ts

# 3. Validate
npx jest src/domain-events/
cd web; npx vitest run
```

After rollback the codebase returns to the V21 Phase 3 end-state.
The V20.6 + V20.9 event platform stays untouched and continues
to operate as before.

---

## 2 — Wave 1 (Kafka adoption) rollback

If Kafka adoption goes wrong:

```ts
// Remove the EVENT_BUS_ADAPTER provider registration
// in src/app.module.ts (or the deployment-specific module).
//
// The dispatcher constructor falls back to the in-memory
// adapter automatically:
//
//   this.adapter = adapter ?? inMemory ?? new InMemoryEventBusAdapter();
//
// No data loss — the outbox keeps growing and the dispatcher
// continues to ship to the in-memory adapter (which is a
// no-op in the absence of consumers, but the durable record
// of every event is preserved in `FinancialEventOutbox`).
```

Restart the process; the broker integration is gone.

---

## 3 — Wave 2-3 (RabbitMQ / Redis Streams) rollback

Same pattern as Wave 1 — remove the `EVENT_BUS_ADAPTER`
provider registration and restart.

---

## 4 — Wave 4 (Frontend SSE adoption) rollback

If a particular page's SSE wire-up causes problems:

```tsx
// Remove the hook call from the page; everything reverts to
// the existing 45-second polling pattern.
- useRealtimeFinancialFeed({
-   channel: 'customer360',
-   customerId,
-   accessToken: token,
- });
```

The page falls back to the canonical query pattern with
periodic refetch (already in production today). No data
loss; only the live-update latency degrades from sub-second
to ~45-second polling.

---

## 5 — Granular rollback — disable all SSE without touching pages

Set `VITE_DISABLE_REALTIME_FEED=1` in the environment and the
`useRealtimeFinancialFeed` hook can be patched in one place to
short-circuit:

```ts
// proposed addition for V22 — kill switch for the whole feed
if (import.meta.env.VITE_DISABLE_REALTIME_FEED) {
  return { connected: false, lastEventAt: null, reconnects: 0, error: null };
}
```

Restart Vite preview / production server with the env var set.
All SSE consumers degrade to polling-only.

---

## 6 — Outbox cleanup (manual, only if absolutely necessary)

The outbox is **append-only** (Phase 4 lock-in test 5). If
storage pressure ever requires trimming:

  1. Choose a cutoff date such that `deliveredAt < cutoff` for
     every row to be removed (only delivered rows).
  2. Take a backup snapshot of the rows being trimmed.
  3. Add a temporary admin script with `TRIM_OUTBOX=true` env
     guard.
  4. Run the script during a maintenance window.
  5. Update the Phase 4 lock-in test allow-list to permit the
     trimming script (and remove the script after the trim
     completes).

The lock-in test will FAIL the build until step 5 is done —
that is the desired CI signal that the outbox invariant has
been temporarily relaxed.
