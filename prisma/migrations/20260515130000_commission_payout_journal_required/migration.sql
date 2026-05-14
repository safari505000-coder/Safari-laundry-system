-- PHASE 3: Enforce that COLLECTION mode CommissionPayouts always have a sourceJournalEntryId.
-- SALE mode payouts link via sourceOrderId (no journal entry needed), so we use
-- a conditional CHECK rather than making the column globally NOT NULL.
--
-- This closes the gap left by the removal of DebtLedgerEntry:
-- before V20.4, COLLECTION payouts used sourceDebtEntryId; now they use
-- sourceJournalEntryId. Any COLLECTION payout without a journal entry is
-- an orphan and should not exist in production.

ALTER TABLE "CommissionPayout"
  ADD CONSTRAINT "chk_collection_requires_journal_entry"
  CHECK (mode != 'COLLECTION' OR "sourceJournalEntryId" IS NOT NULL);
