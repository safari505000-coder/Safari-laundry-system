-- V20.4 — Add sourceJournalEntryId to CommissionPayout.
--
-- V19.16 created CommissionPayout with sourceDebtEntryId (FK to DebtLedgerEntry).
-- V20.4 removes DebtLedgerEntry as the authoritative debt source and replaces it
-- with JournalEntry. COLLECTION mode payouts now key their idempotency on a
-- JournalEntry id. sourceDebtEntryId remains as a nullable legacy column for
-- historical rows; sourceJournalEntryId is the new canonical FK for V20.4+.
--
-- JournalEntry table was created in 20260506160000_double_entry_journal_foundation.

-- Column exists on production (added without a migration during V20.4 development).
-- IF NOT EXISTS makes this migration safe for both fresh CI databases and production.
ALTER TABLE "CommissionPayout"
  ADD COLUMN IF NOT EXISTS "sourceJournalEntryId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CommissionPayout_sourceJournalEntryId_fkey'
  ) THEN
    ALTER TABLE "CommissionPayout"
      ADD CONSTRAINT "CommissionPayout_sourceJournalEntryId_fkey"
      FOREIGN KEY ("sourceJournalEntryId") REFERENCES "JournalEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_commission_payout_per_journal_entry"
  ON "CommissionPayout" ("sourceJournalEntryId", "ruleId", "earnerUserId");
