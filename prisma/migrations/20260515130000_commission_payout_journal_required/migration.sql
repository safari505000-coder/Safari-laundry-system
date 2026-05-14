-- PHASE 3: Enforce that COLLECTION mode CommissionPayouts always have a sourceJournalEntryId.
-- SALE mode payouts link via sourceOrderId (no journal entry needed), so we use
-- a conditional CHECK rather than making the column globally NOT NULL.
--
-- This closes the gap left by the removal of DebtLedgerEntry:
-- before V20.4, COLLECTION payouts used sourceDebtEntryId; now they use
-- sourceJournalEntryId. Any COLLECTION payout without a journal entry is
-- an orphan and should not exist in production.
--
-- STEP 1: Remove orphaned COLLECTION rows (null sourceJournalEntryId).
-- These are legacy rows created before V20.4 when DebtLedgerEntry was the
-- idempotency key. They carry no referential value and are safe to delete;
-- the matching commission earnings were never paid out (status != PAID).
-- A notice is raised first so the deletion is visible in the migration log.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM "CommissionPayout"
  WHERE mode = 'COLLECTION'
    AND "sourceJournalEntryId" IS NULL;

  IF orphan_count > 0 THEN
    RAISE NOTICE 'Phase3: deleting % orphaned COLLECTION CommissionPayout rows (sourceJournalEntryId IS NULL)', orphan_count;
    DELETE FROM "CommissionPayout"
    WHERE mode = 'COLLECTION'
      AND "sourceJournalEntryId" IS NULL;
  END IF;
END $$;

-- STEP 2: Add the CHECK constraint (safe now that orphans are gone).
ALTER TABLE "CommissionPayout"
  ADD CONSTRAINT "chk_collection_requires_journal_entry"
  CHECK (mode != 'COLLECTION' OR "sourceJournalEntryId" IS NOT NULL);
