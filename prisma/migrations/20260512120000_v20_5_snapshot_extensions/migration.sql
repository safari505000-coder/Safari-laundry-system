-- V20.5 — Phase 7 Financial Snapshot extensions.
--
-- Adds the materialised columns for the V20.5 read layer:
--   • agingBucket      — denormalised worst-case bucket from
--                         AgingService.getCustomerAging.
--   • riskLevel        — denormalised RiskScoringService level.
--   • collectionsStage — denormalised CollectionsAccount.currentStage.
--   • overdueAmountKd  — sum of remaining on overdue invoices.
--   • riskScore        — numeric 0..100 score.
--
-- All additive — existing columns and indexes untouched. Defaults
-- match the "no data yet" path so a missing row reads back as
-- the most permissive state (NONE risk, no overdue).

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "agingBucket" TEXT NOT NULL DEFAULT 'CURRENT';

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "riskLevel" TEXT NOT NULL DEFAULT 'LOW';

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "collectionsStage" TEXT NOT NULL DEFAULT 'NEW';

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "overdueAmountKd" DECIMAL(19,4) NOT NULL DEFAULT 0;

ALTER TABLE "FinancialSnapshot"
  ADD COLUMN IF NOT EXISTS "oldestOverdueDays" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "FinancialSnapshot_riskLevel_idx"
  ON "FinancialSnapshot"("riskLevel");
CREATE INDEX IF NOT EXISTS "FinancialSnapshot_agingBucket_idx"
  ON "FinancialSnapshot"("agingBucket");
CREATE INDEX IF NOT EXISTS "FinancialSnapshot_collectionsStage_idx"
  ON "FinancialSnapshot"("collectionsStage");
