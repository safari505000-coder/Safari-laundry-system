-- V19.11 — Unify debt + payments into DebtLedgerEntry
--
-- 1. Extend DebtSource with PAYMENT (settlements).
-- 2. Add optional refEntryId (FIFO allocation) and sourceRef (backfill /
--    idempotency key for dual-write from TransactionHistory).
-- 3. Keep the table append-only; service-layer middleware rejects
--    UPDATE / DELETE. (DB-level trigger deferred to V19.12.)

ALTER TYPE "DebtSource" ADD VALUE IF NOT EXISTS 'PAYMENT';

ALTER TABLE "DebtLedgerEntry"
  ADD COLUMN IF NOT EXISTS "refEntryId" UUID NULL,
  ADD COLUMN IF NOT EXISTS "sourceRef"  TEXT NULL;

-- FK: settlement → debt-creation row (FIFO target). Nullable.
ALTER TABLE "DebtLedgerEntry"
  ADD CONSTRAINT "DebtLedgerEntry_refEntryId_fkey"
  FOREIGN KEY ("refEntryId") REFERENCES "DebtLedgerEntry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Idempotency guard for backfill / dual-write. Enforces that a given
-- TransactionHistory.id (or other external key) produces at most one
-- PAYMENT row in the ledger even if the backfill script is re-run.
CREATE UNIQUE INDEX IF NOT EXISTS "DebtLedgerEntry_sourceRef_key"
  ON "DebtLedgerEntry" ("sourceRef");

CREATE INDEX IF NOT EXISTS "DebtLedgerEntry_refEntryId_idx"
  ON "DebtLedgerEntry" ("refEntryId");
