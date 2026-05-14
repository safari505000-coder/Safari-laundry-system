-- V25: add missing database indexes
-- CommissionPayout: ensure sourceJournalEntryId column exists before any
-- migration references it. Fresh databases reach this point without an
-- earlier migration that adds the column (V20.4 introduced it via the
-- generated Prisma client only). Production DBs that already have the
-- column are unaffected because of IF NOT EXISTS.
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

-- CommissionPayout: faster lookup by sourceJournalEntryId
CREATE INDEX IF NOT EXISTS "CommissionPayout_sourceJournalEntryId_idx" ON "CommissionPayout"("sourceJournalEntryId");
-- Customer: fast filter for blocked customers
CREATE INDEX IF NOT EXISTS "Customer_isBlocked_idx" ON "Customer"("isBlocked");
-- User: fast lookup for customer-portal users by linked customer
CREATE INDEX IF NOT EXISTS "User_linkedCustomerId_idx" ON "User"("linkedCustomerId");
-- AuditLog: actor activity timeline queries
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_action_timestamp_idx" ON "audit_logs"("actorId", "action", "timestamp");
