-- FINANCIAL HARDENING — root-cause elimination for ledger drift.
--
-- Three independent, additive protections. None of them change correct
-- accounting behaviour; they make incorrect states *impossible to commit*
-- from any API, script, or psql session, and add a persisted daily report.
--
--   1. DailyAccountingIntegrityReport      — persisted daily integrity runs.
--   2. JournalLine CHECK constraints        — no negative / ambiguous lines.
--   3. JournalEntry balance constraint trigger — Σ debit = Σ credit per entry
--      (deferred to COMMIT). An imbalanced entry can never be committed.
--
-- Bypass for legitimate migrations / reset scripts reuses the SAME session
-- flag as the existing append-only guard: `app.immutable_ledger_bypass=true`.

-- =====================================================================
-- 1. DailyAccountingIntegrityReport
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountingIntegrityStatus') THEN
    CREATE TYPE "AccountingIntegrityStatus" AS ENUM ('HEALTHY', 'WARNING', 'CRITICAL');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "DailyAccountingIntegrityReport" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "status"        "AccountingIntegrityStatus" NOT NULL,
  "driftCount"    INTEGER NOT NULL DEFAULT 0,
  "criticalCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount"  INTEGER NOT NULL DEFAULT 0,
  "checks"        JSONB NOT NULL,
  "summary"       TEXT,
  "generatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "durationMs"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DailyAccountingIntegrityReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DailyAccountingIntegrityReport_generatedAt_idx"
  ON "DailyAccountingIntegrityReport" ("generatedAt");
CREATE INDEX IF NOT EXISTS "DailyAccountingIntegrityReport_status_generatedAt_idx"
  ON "DailyAccountingIntegrityReport" ("status", "generatedAt");

-- The report table is append-only (immutable audit history). Reuse the
-- existing generic guard installed by 20260507120000_..._immutability.
DROP TRIGGER IF EXISTS "DailyAccountingIntegrityReport_no_update" ON "DailyAccountingIntegrityReport";
CREATE TRIGGER "DailyAccountingIntegrityReport_no_update"
BEFORE UPDATE ON "DailyAccountingIntegrityReport"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "DailyAccountingIntegrityReport_no_delete" ON "DailyAccountingIntegrityReport";
CREATE TRIGGER "DailyAccountingIntegrityReport_no_delete"
BEFORE DELETE ON "DailyAccountingIntegrityReport"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

-- =====================================================================
-- 2. JournalLine CHECK constraints (non-negative, non-ambiguous)
--
-- Added NOT VALID so the migration NEVER scans/locks existing rows on a
-- live deploy. New rows are enforced immediately. Existing rows are
-- already clean (appendBalanced has always rejected negative/ambiguous
-- lines); an operator may run `VALIDATE CONSTRAINT` during a maintenance
-- window to prove the historical set.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalLine_debit_nonneg'
  ) THEN
    ALTER TABLE "JournalLine"
      ADD CONSTRAINT "JournalLine_debit_nonneg" CHECK ("debit" >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalLine_credit_nonneg'
  ) THEN
    ALTER TABLE "JournalLine"
      ADD CONSTRAINT "JournalLine_credit_nonneg" CHECK ("credit" >= 0) NOT VALID;
  END IF;

  -- A line may carry a debit OR a credit, never both > 0 (ambiguous line).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalLine_not_both_sides'
  ) THEN
    ALTER TABLE "JournalLine"
      ADD CONSTRAINT "JournalLine_not_both_sides"
      CHECK (NOT ("debit" > 0 AND "credit" > 0)) NOT VALID;
  END IF;
END$$;

-- =====================================================================
-- 3. Per-entry balance — DEFERRABLE constraint trigger
--
-- Fires at COMMIT (INITIALLY DEFERRED) so all lines of an entry are
-- present before the check runs. Guarantees Σ debit = Σ credit (±0.001)
-- for every JournalEntry that has lines. This makes an *imbalanced*
-- entry impossible to commit through ANY path — Prisma, raw SQL, psql.
--
-- Honors `app.immutable_ledger_bypass = 'true'` for the rare legitimate
-- maintenance write, identical to the append-only guard.
-- =====================================================================

CREATE OR REPLACE FUNCTION "journal_entry_balance_guard"()
RETURNS trigger AS $$
DECLARE
  bypass_flag TEXT;
  total_debit  NUMERIC(19,4);
  total_credit NUMERIC(19,4);
  line_count   INTEGER;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0)
    INTO line_count, total_debit, total_credit
  FROM "JournalLine"
  WHERE "entryId" = NEW."entryId";

  -- Entry may have been deleted by the time the deferred check runs
  -- (e.g. a rolled-back nested write) — nothing to validate.
  IF line_count = 0 THEN
    RETURN NULL;
  END IF;

  IF line_count < 2 THEN
    RAISE EXCEPTION
      'JournalEntry % must have at least two lines (found %)',
      NEW."entryId", line_count
      USING ERRCODE = '23514';
  END IF;

  IF ABS(total_debit - total_credit) > 0.001 THEN
    RAISE EXCEPTION
      'JournalEntry % is unbalanced: debit=% credit=% (delta=%)',
      NEW."entryId", total_debit, total_credit, (total_debit - total_credit)
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "JournalLine_entry_balanced" ON "JournalLine";
CREATE CONSTRAINT TRIGGER "JournalLine_entry_balanced"
AFTER INSERT ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "journal_entry_balance_guard"();
