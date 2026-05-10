-- V20.4 — Phase 1 / Phase 4 read-side projection tables.
--
-- Both tables are derived from the financial primaries (Journal,
-- DebtLedgerEntry, Order, CustomerWallet). Dropping them MUST be
-- safe: `FinancialSnapshotService.rebuild()` recomputes every row
-- from primaries with deterministic results.
--
-- Indexes are sized for the operational read patterns:
--   • `customerId` UNIQUE  — Subscribers / Outstanding / Customer 360
--                             lookups by id (the hot path).
--   • `remainingDebtKd`    — collections list ordered by exposure.
--   • `overdueInvoicesCount`— red KPI cards segmenting overdue cohort.
--   • `lastPaymentAt`      — analytics ("recent payment activity").
--   • `refreshedAt`        — projector progress / staleness queries.

CREATE TABLE "FinancialSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "journalArBalanceKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "remainingDebtKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "paidTotalKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalInvoicesKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unpaidInvoicesCount" INTEGER NOT NULL DEFAULT 0,
  "partiallyPaidInvoicesCount" INTEGER NOT NULL DEFAULT 0,
  "activeInvoicesCount" INTEGER NOT NULL DEFAULT 0,
  "overdueInvoicesCount" INTEGER NOT NULL DEFAULT 0,
  "walletBalanceKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "walletLiabilityKd" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "lastPaymentAt" TIMESTAMP(3),
  "lastInvoiceAt" TIMESTAMP(3),
  "canonicalSource" TEXT NOT NULL DEFAULT 'PARTIAL_PAYMENT_REMAINING',
  "v20_3TrueAccountingActive" BOOLEAN NOT NULL DEFAULT FALSE,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refreshContext" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialSnapshot_customerId_key"
  ON "FinancialSnapshot"("customerId");
CREATE INDEX "FinancialSnapshot_refreshedAt_idx"
  ON "FinancialSnapshot"("refreshedAt");
CREATE INDEX "FinancialSnapshot_remainingDebtKd_idx"
  ON "FinancialSnapshot"("remainingDebtKd");
CREATE INDEX "FinancialSnapshot_overdueInvoicesCount_idx"
  ON "FinancialSnapshot"("overdueInvoicesCount");
CREATE INDEX "FinancialSnapshot_lastPaymentAt_idx"
  ON "FinancialSnapshot"("lastPaymentAt");

ALTER TABLE "FinancialSnapshot"
  ADD CONSTRAINT "FinancialSnapshot_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinancialKpiSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kpiKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "payload" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "computedFor" TIMESTAMP(3) NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "inputDigest" TEXT,
  CONSTRAINT "FinancialKpiSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialKpiSnapshot_kpiKey_scope_key"
  ON "FinancialKpiSnapshot"("kpiKey", "scope");
CREATE INDEX "FinancialKpiSnapshot_computedAt_idx"
  ON "FinancialKpiSnapshot"("computedAt");

-- V20.4 — Phase 15 hot-read indexes for the canonical helpers
-- (`computeCanonicalCustomerDebt`, `getCustomerDebtFromJournalAR`,
-- `OutstandingService.listOutstanding`). Additive — existing rows
-- and queries continue to work unchanged.
--
-- All indexes are guarded with IF NOT EXISTS so re-running this
-- migration on environments that already created similar indexes
-- by hand is a no-op. The single-column `[accountId]`,
-- `[customerId, createdAt]`, and `[customerId]` indexes already
-- exist (declared in schema.prisma); only the missing FIFO-replay
-- index on DebtLedgerEntry is added here.
CREATE INDEX IF NOT EXISTS "DebtLedgerEntry_customer_source_createdAt_idx"
  ON "DebtLedgerEntry"("customerId", "source", "createdAt");
