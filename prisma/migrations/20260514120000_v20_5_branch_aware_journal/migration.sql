-- V20.5 — Phase 9 Multi-Branch Accounting.
--
-- Adds nullable `branchId` to JournalEntry. Backfill is intentionally
-- DEFERRED — historical entries retain `branchId IS NULL` and are
-- attributed to the org-wide bucket in cross-branch reports. Operators
-- who want to backfill can run `scripts/backfill-journal-branch.ts`
-- which infers branch from `Order.handoverShift.branchId` and
-- `User.branchId` of the actor.
--
-- Append-only constraints on JournalEntry remain untouched — adding
-- a column is not blocked by the V20.1-v4 immutability triggers
-- (they fire on UPDATE/DELETE/TRUNCATE, not on schema migrations).

ALTER TABLE "JournalEntry"
  ADD COLUMN IF NOT EXISTS "branchId" UUID;

-- FK is OPTIONAL with ON DELETE SET NULL so deleting a branch
-- does not cascade-delete historical journal entries.
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "JournalEntry_branchId_createdAt_idx"
  ON "JournalEntry"("branchId", "createdAt");
