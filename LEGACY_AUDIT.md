# LEGACY_AUDIT.md — Safari ERP

> **Generated:** 2026-05-13  
> **Version audited:** 1.5.5 (branch: main)  
> **Scope:** Full codebase — `src/` (NestJS API) + `web/src/` (React SPA)  
> **Risk legend:** 🔴 HIGH (breaks or hides bugs) · 🟡 MEDIUM (tech debt) · 🟢 LOW (cleanup)  
> **Action legend:** DELETE · REFACTOR · KEEP · INVESTIGATE

---

## Table of Contents

1. [Dead Code & Unused Files](#1-dead-code--unused-files)
2. [Duplicate Logic](#2-duplicate-logic)
3. [V24 vs V25 Conflicts](#3-v24-vs-v25-conflicts)
4. [TODO / FIXME / HACK Comments](#4-todo--fixme--hack-comments)
5. [Deprecated / Legacy Patterns](#5-deprecated--legacy-patterns)
6. [Frontend-Backend Mismatches](#6-frontend-backend-mismatches)
7. [Database Schema Issues](#7-database-schema-issues)
8. [Dependency Audit](#8-dependency-audit)

---

## 1. Dead Code & Unused Files

### 1.1 Event Bus Stub Adapters — Never Wired

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 1 | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | all | `KafkaEventBusAdapter` — implements `EventBusAdapter` with three empty TODO methods. Never imported in any `@Module`. Only referenced in a spec file for shape-checking. | 🟡 | DELETE or KEEP as a future integration placeholder with a clear README note |
| 2 | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | all | `RabbitMQEventBusAdapter` — identical pattern: stub implement, no module wiring. | 🟡 | DELETE or document as integration placeholder |
| 3 | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | all | `RedisStreamsEventBusAdapter` — same stub pattern. | 🟡 | DELETE or document as integration placeholder |

**Detail:** All three adapters are tested only in `src/domain-events/v21-phase4-event-bus-integrity.spec.ts` (line ~231), which merely instantiates them to verify they satisfy the interface contract. The application uses the in-process `EventEmitter2` bus from `@nestjs/event-emitter`; none of these adapters run in production.

### 1.2 Empty Wallets Module

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 4 | `src/wallets/wallets.module.ts` | all | `@Module({})` — zero providers, zero exports, zero imports. Registered in `AppModule`. | 🟡 | INVESTIGATE — determine if this was a planned module that was cancelled or merged elsewhere, then DELETE |

**Detail:** The `Wallet` model exists in `prisma/schema.prisma` and is queried in one place (`src/finance/finance.service.ts` ~line 210) in a consolidated cash snapshot. The module itself is a no-op.

### 1.3 Bootstrap Warning File

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 5 | `src/bootstrap/v20-4-final-ledger-warning.ts` | all | Emits a console warning at startup if `V20_4_FINAL_LEDGER` env var is falsy. Called from `src/main.ts:128`. | 🟢 | DELETE once V20 transition is fully complete and env flags are removed |

---

## 2. Duplicate Logic

### 2.1 Dual Payroll Pages

| # | File | Route | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 6 | `web/src/pages/payroll-page.tsx` | `/payroll` | Standalone payroll page — reads `row.netSalaryKd` post-V25 purge | 🟡 | INVESTIGATE — confirm which is the live route and which is dead |
| 7 | `web/src/modules/staff/pages/payroll-unified-page.tsx` | embedded in `/staff-hub` | Second payroll UI embedded in the Staff Hub page | 🟡 | INVESTIGATE — if both render, reconcile; if one is dead, DELETE |

**Detail:** `web/src/App.tsx` routes both. User-facing risk is low if they are styled identically and use the same API, but any logic change must be made in two places — classic divergence risk.

### 2.2 `totalDueKd` Computed in Multiple Services

| # | File | Approx. line | What it is | Risk | Action |
|---|------|-------------|-----------|------|--------|
| 8 | `src/call-center/customer-360-financials.ts` | ~40 | Computes `totalDueKd` from raw ledger rows | 🟡 | REFACTOR to single canonical source |
| 9 | `src/finance/outstanding/outstanding.service.ts` | ~80 | Re-computes `totalDueKd` independently | 🟡 | REFACTOR |
| 10 | `src/finance/canonical-financial-projection.ts` | ~60 | Third computation of same field | 🟡 | REFACTOR |

**Detail:** Three independent implementations of the same financial sum means a bug fix or rounding rule change must be applied in three places. Should be extracted to a shared util or delegated entirely to the canonical projection service.

### 2.3 Frontend Finance Engine vs. Server Totals

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 11 | `web/src/utils/finance-engine.ts` | all | `sumLinesKd`, `computeSessionTotals`, `computeMultiInvoiceParts`, `computeSubscriptionTotals` — client-side billing math for POS cart preview | 🟢 | KEEP — correctly annotated as `@V24-LEGACY-MATH-EXEMPTION` (pre-submission cart previews only). Not a conflict with server totals. |

---

## 3. V24 vs V25 Conflicts

These are leftover commented-out code blocks from the V24 "frontend math purge" and V25 campaigns. They are inert but add noise and confusion.

### 3.1 Commented-Out Frontend Reduce Logic

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 12 | `web/src/pages/live-monitor-page.tsx` | 73–77 | `@V24-LEGACY-MATH` — commented-out `sumIssuedKd` arrow function using `Array.reduce()`. Replaced by `pos.totals` server field. | 🟢 | DELETE the comment block |
| 13 | `web/src/pages/monthly-summary-page.tsx` | 611–616 | `@V24-LEGACY-MATH` — commented-out `reduce + parseFloat` expense total. Replaced by `totalApprovedKd` from server. | 🟢 | DELETE the comment block |

### 3.2 V25 Payroll Field — Confirmed Clean

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 14 | `web/src/pages/payroll-page.tsx` | 49–57 | Post-V25: reads `row.netSalaryKd` directly (server-computed). No client-side reduce remaining. | 🟢 | KEEP — correctly migrated |

---

## 4. TODO / FIXME / HACK Comments

### 4.1 Event Bus Adapter TODOs (Blocked on Infrastructure Decision)

| # | File | Line | Comment | Risk | Action |
|---|------|------|---------|------|--------|
| 15 | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | 40 | `// TODO(deploy): connect to Kafka cluster` | 🟡 | Resolve infrastructure decision — implement or DELETE adapter |
| 16 | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | 64 | `// TODO(deploy): publish event to Kafka topic` | 🟡 | Same as above |
| 17 | `src/domain-events/adapters/kafka-event-bus.adapter.ts` | 69 | `// TODO(deploy): subscribe to Kafka topic` | 🟡 | Same as above |
| 18 | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | 33 | `// TODO(deploy): connect to RabbitMQ` | 🟡 | Resolve or DELETE |
| 19 | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | 57 | `// TODO(deploy): publish event to RabbitMQ` | 🟡 | Resolve or DELETE |
| 20 | `src/domain-events/adapters/rabbitmq-event-bus.adapter.ts` | 62 | `// TODO(deploy): subscribe to RabbitMQ` | 🟡 | Resolve or DELETE |
| 21 | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | 36 | `// TODO(deploy): connect to Redis Streams` | 🟡 | Resolve or DELETE |
| 22 | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | 53 | `// TODO(deploy): publish event to Redis Streams` | 🟡 | Resolve or DELETE |
| 23 | `src/domain-events/adapters/redis-streams-event-bus.adapter.ts` | 58 | `// TODO(deploy): subscribe to Redis Streams` | 🟡 | Resolve or DELETE |

**Context:** The `TODO(deploy)` tag across all three adapters indicates this was intentionally deferred pending an infrastructure decision about which message broker to use. The current system uses in-process EventEmitter2 — acceptable for a monolith but will not survive horizontal scaling.

### 4.2 Serial Counter Deprecation TODO

| # | File | Lines | Comment | Risk | Action |
|---|------|-------|---------|------|--------|
| 24 | `src/serials/serial-counter.service.ts` | 29–30 | `@deprecated — use per-operator key instead` on `ORDER_SERIAL_KEY` constant | 🟡 | REFACTOR — remove the constant and its last callers once confirmed unused in production data |

---

## 5. Deprecated / Legacy Patterns

### 5.1 Dual General Ledger (Flat GL + Double-Entry GL)

| # | File / Pattern | What it is | Risk | Action |
|---|---------------|-----------|------|--------|
| 25 | `src/general-ledger/general-ledger.service.ts` — `append()` | Writes to `GeneralLedgerEntry` (flat legacy table) still active alongside double-entry `JournalEntry` system | 🔴 | INVESTIGATE — confirm which is canonical per current feature flags, then deprecate the other |
| 26 | All files referencing `GeneralLedgerEntry` (~20 files) | Flat single-entry legacy GL records alongside proper double-entry journal | 🔴 | REFACTOR — migrate all reads/aggregations to `JournalEntry` once feature flags confirm V20.4+ is stable |
| 27 | `src/general-ledger/financial-transaction-processor.service.ts` | Dual-writes to both GL systems on every transaction | 🔴 | REFACTOR — remove flat GL write once double-entry is confirmed canonical |

**Context:** The V20 migration introduced a proper double-entry system (`JournalEntry`, `JournalLine`, `Account`) alongside the legacy flat `GeneralLedgerEntry`. Feature flags (`V20_4_FINAL_LEDGER`, `V20_3_TRUE_ACCOUNTING`, `USE_JOURNAL_AS_SOURCE`) gate which system is canonical. If these flags are ON in production, the flat GL writes are wasted I/O. If they are OFF, the double-entry writes are the waste.

### 5.2 V20 Feature Flags Still In Production

| # | Flag / File | What it is | Risk | Action |
|---|------------|-----------|------|--------|
| 28 | `V20_4_FINAL_LEDGER` env var | Controls whether double-entry GL is canonical | 🟡 | DELETE flag + conditional once migration is permanent |
| 29 | `V20_3_TRUE_ACCOUNTING` env var | Controls true accounting mode | 🟡 | DELETE flag + conditional |
| 30 | `USE_JOURNAL_AS_SOURCE` env var | Controls debt source (journal vs. ledger) | 🟡 | DELETE flag + conditional |
| 31 | `src/bootstrap/v20-4-final-ledger-warning.ts` | Startup warning if `V20_4_FINAL_LEDGER` is falsy | 🟢 | DELETE once flag is removed |

**Files containing feature flag checks (partial list):**
- `src/finance/debt-visibility/debt-visibility.service.ts`
- `src/finance/outstanding/outstanding.service.ts`
- `src/finance/services/debt.service.ts`
- `src/general-ledger/double-entry-journal.service.ts`
- `src/general-ledger/financial-transaction-processor.service.ts`

### 5.3 Deprecated Serial Counter Key

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 32 | `src/serials/serial-counter.service.ts` | 29–30 | `ORDER_SERIAL_KEY = 'ORDER_SERIAL'` — global serial counter deprecated since V19.24. Per-operator keys (`OU_<userId>`) are the current standard. | 🟡 | INVESTIGATE callers, then DELETE constant and legacy `peek()` default at line 145 |
| 33 | `src/serials/serial-counter.service.ts` | ~145 | `peek()` method — defaults to legacy global key when no key is provided | 🟡 | REFACTOR — require explicit key parameter; remove default |

### 5.4 Deprecated Field `effectiveDebtKd`

| # | File | What it is | Risk | Action |
|---|------|-----------|------|--------|
| 34 | `src/finance/v22-current-debt-consistency-guards.spec.ts` | Line ~194 marks `effectiveDebtKd` as deprecated — replaced by `currentDebtKd` in V22+ | 🟡 | INVESTIGATE all usages; if field is still returned in API responses, phase out with a deprecation notice |

### 5.5 `totalDueKd` Removed from Wire DTO but Persists Internally

| # | File | What it is | Risk | Action |
|---|------|-----------|------|--------|
| 35 | `src/call-center/customer-360-financials.ts` | `totalDueKd` removed from external DTO per V23.2 but internal field persists | 🟡 | INVESTIGATE — if it's not serialised to clients, safe; if any client still reads it, it could return stale data |

---

## 6. Frontend-Backend Mismatches

### 6.1 Backend Controllers With No Frontend Caller

These controllers expose API endpoints that have no corresponding call in `web/src/lib/api.ts` or any frontend module API file.

| # | Controller file | Route prefix | What it is | Risk | Action |
|---|----------------|-------------|-----------|------|--------|
| 36 | `src/finance/audit/financial-audit.controller.ts` | `GET /api/finance/audit/*` | Financial audit trail endpoints — restricted to OWNER/GM/ACCOUNTANT | 🟡 | INVESTIGATE — may be called by external tools or is a planned feature; add frontend or document as internal-only |
| 37 | `src/finance/risk/risk-scoring.controller.ts` | `GET /api/finance/risk/*` | Risk scoring endpoints | 🟡 | INVESTIGATE — same as above |
| 38 | `src/finance/fraud/fraud-detection.controller.ts` | `GET /api/finance/fraud/*` | Fraud detection endpoints | 🟡 | INVESTIGATE |
| 39 | `src/finance/aging/aging.controller.ts` | `GET /api/finance/aging/*` | AR aging report endpoints | 🟡 | INVESTIGATE — high business value; may be simply missing from frontend |
| 40 | `src/finance/timeline/financial-timeline.controller.ts` | `GET /api/finance/timeline/*` | Customer financial timeline | 🟡 | INVESTIGATE |
| 41 | `src/finance/periods/financial-periods.controller.ts` | `GET /api/finance/periods/*` | Financial period management | 🟡 | INVESTIGATE |

### 6.2 Route Path Mismatch — Collections Workflow

| # | Frontend call | Backend controller | Risk | Action |
|---|--------------|-------------------|------|--------|
| 42 | `web/src/modules/call-center/outstanding/api/outstanding-api.ts` calls `/api/collections/workflow/*` | Backend controller may be registered as `/collections-workflow` (no slash-collections prefix) | 🔴 | INVESTIGATE — if paths don't match, these API calls are silently 404ing in production |

**Detail:** The frontend `outstanding-api.ts` (lines 172–189) references a collections workflow path. Verify the exact `@Controller()` decorator path on the backend controller matches exactly what the frontend calls.

### 6.3 `totalDueKd` Still Consumed by Frontend

| # | File | Lines | What it is | Risk | Action |
|---|------|-------|-----------|------|--------|
| 43 | `web/src/modules/call-center/outstanding/api/outstanding-api.ts` | 31, 66, 172–189 | Frontend reads `totalDueKd` field from API response | 🟡 | Verify backend still serialises this field; if removed from DTO per V23.2, frontend will silently receive `undefined` |

---

## 7. Database Schema Issues

### 7.1 Dual Collections Systems

| # | Table | What it is | Risk | Action |
|---|-------|-----------|------|--------|
| 44 | `CustomerCollectionStatus` | Legacy AR status table — per-customer collection status flags, created pre-V20.5 | 🔴 | INVESTIGATE — determine if this table is still written to or only read by reports |
| 45 | `CollectionsAccount` | New V20.5 Phase 3 collections system — proper debit/credit account per customer | 🔴 | INVESTIGATE — if both systems are live, they may diverge silently |

**Context:** Two parallel collections accounting systems exist in the schema. The V20.5 migration introduced `CollectionsAccount` as the correct ledger-style replacement for the flat `CustomerCollectionStatus` flags. If both are written to, reconciliation queries may double-count or miss entries depending on which table they read from.

### 7.2 `Wallet` Table — Low Utilisation

| # | Table | What it is | Risk | Action |
|---|-------|-----------|------|--------|
| 46 | `Wallet` | Full model in schema.prisma, but `WalletsModule` is empty and only one aggregate query reads from this table | 🟡 | INVESTIGATE — if the wallet feature was abandoned, remove the model and migration; if planned, document the roadmap |

### 7.3 Legacy Flat General Ledger Table

| # | Table | What it is | Risk | Action |
|---|-------|-----------|------|--------|
| 47 | `GeneralLedgerEntry` | Flat single-entry ledger rows — legacy schema alongside `JournalEntry`/`JournalLine` double-entry tables | 🟡 | DELETE table + model once V20.4 is confirmed canonical everywhere and all reads migrated to double-entry system |

### 7.4 Soft-Delete Inconsistency

| # | Pattern | What it is | Risk | Action |
|---|---------|-----------|------|--------|
| 48 | Various models | Some models have `deletedAt DateTime?` soft-delete, others use hard deletes — no consistent pattern | 🟡 | INVESTIGATE — ensure financial records (invoices, journal entries) all use soft-delete and are never hard-deleted |

---

## 8. Dependency Audit

### 8.1 Packages With Unusually Wide Version Ranges

| # | Package | Version spec | Risk | Action |
|---|---------|-------------|------|--------|
| 49 | `@types/node` | `^24.0.0` | Engine requires `^20.19.0 \|\| >=22.12.0` — type defs for Node 24 may expose APIs not available in Node 20 | 🟡 | Pin `@types/node` to `^20.x` or `^22.x` to match engine spec |
| 50 | `@types/jest` | `^30.0.0` | Jest 30 types are very new — may have incomplete type coverage | 🟢 | Monitor for type errors; downgrade if issues arise |

### 8.2 Packages That May Be Unused

| # | Package | Where used | Risk | Action |
|---|---------|-----------|------|--------|
| 51 | `@opentelemetry/auto-instrumentations-node` | Listed in deps — verify it's wired in `src/tracing.ts` or equivalent | 🟡 | INVESTIGATE — auto-instrumentation has a non-trivial startup cost; confirm it's intentional |
| 52 | `@opentelemetry/exporter-trace-otlp-http` | Trace exporter — requires an OTLP-compatible collector endpoint | 🟡 | INVESTIGATE — if no collector is configured in production env vars, traces are dropped silently |
| 53 | `prom-client` | Prometheus metrics — verify a `/metrics` endpoint is exposed and scraped | 🟡 | INVESTIGATE — if no Prometheus scrape is configured, this dependency is dead weight |

### 8.3 Potentially Outdated / Superseded Packages

| # | Package | Concern | Risk | Action |
|---|---------|---------|------|--------|
| 54 | `passport` + `passport-jwt` | NestJS 11 ships improved guard abstractions; passport integration is the older pattern | 🟢 | KEEP for now — works correctly; migrate to new NestJS auth when convenient |
| 55 | `multer ^2.1.1` | Multer 2.x is a major bump — verify multipart file upload still works end-to-end | 🟢 | KEEP — verify with upload tests |
| 56 | `bcrypt ^6.0.0` | bcrypt 6 is newer; confirm `@types/bcrypt ^6.0.0` matches | 🟢 | KEEP — versions aligned |

### 8.4 Frontend Dependencies (web/package.json)

| # | Package | Concern | Risk | Action |
|---|---------|---------|------|--------|
| 57 | `Dexie ^4.4.2` | IndexedDB wrapper — verify offline caching is intentional and cleared on logout | 🟡 | INVESTIGATE — stale IndexedDB cache after role changes could expose data to wrong users |
| 58 | `Leaflet ^1.9.4` | Map library — verify it's used in a live route (driver GPS tracking) | 🟢 | KEEP if driver map is live |
| 59 | `react ^19.2.4` | React 19 is the current release — no concern | 🟢 | KEEP |
| 60 | `vite ^8.0.4` | Vite 8 is very new — monitor for breaking changes in build output | 🟢 | KEEP — monitor |

---

## Summary Table

| Risk | Count | Key items |
|------|-------|-----------|
| 🔴 HIGH | 5 | Dual GL system (#25-27), Collections route mismatch (#42), Dual collections DB (#44-45) |
| 🟡 MEDIUM | 40 | Event bus stubs, empty wallet module, duplicate services, feature flags, unused backend controllers |
| 🟢 LOW | 15 | Commented-out V24 blocks, minor cleanup |

### Top Priority Actions

1. **Resolve V20 feature flags** — confirm production flag state and remove the inactive code path entirely (items #25–31)
2. **Verify collections workflow route** — `/api/collections/workflow/*` vs. actual controller path may be a live 404 (item #42)
3. **Audit dual collections tables** — `CustomerCollectionStatus` vs. `CollectionsAccount` — confirm which is written to and which is read by reports (items #44–45)
4. **Delete event bus stubs** — or document them as planned integrations with a clear ticket reference (items #15–23)
5. **Pin `@types/node`** to match engine spec to avoid type drift (item #49)
