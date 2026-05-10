-- V20.1-v4 — Phase 16 + 19 + 21 schema additions + trigger enforcement.
--
-- New tables:
--   * JournalFailureLog  — Phase 16 persistent journal failure log
--                          (drives the circuit breaker)
--   * BackfillAuditLock  — Phase 21 boot-time checksum lock
--
-- Triggers:
--   * TransactionHistory — append-only (UPDATE / DELETE / TRUNCATE)
--   * JournalEntry       — append-only
--   * JournalLine        — append-only
--   * JournalFailureLog  — append-only (the failure log itself is immutable)
--
-- Bypass:
--   Set the session flag `app.immutable_ledger_bypass = 'true'` BEFORE
--   the mutating statement. The script setting this MUST be auditable
--   (e.g. `scripts/reset-invoices.ts` already uses it; backfill scripts
--   should NOT — they write via INSERT only).
--
--   Example:
--     BEGIN;
--     SET LOCAL "app.immutable_ledger_bypass" = 'true';
--     UPDATE "TransactionHistory" SET ... WHERE ...;
--     COMMIT;

CREATE TABLE IF NOT EXISTS "JournalFailureLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID,
  "orderId" UUID,
  "source" TEXT,
  "sourceRef" TEXT,
  "amount" DECIMAL(19, 4),
  "errorCode" TEXT,
  "errorMessage" TEXT NOT NULL,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalFailureLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JournalFailureLog_customerId_createdAt_idx"
  ON "JournalFailureLog" ("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "JournalFailureLog_sourceRef_idx"
  ON "JournalFailureLog" ("sourceRef");
CREATE INDEX IF NOT EXISTS "JournalFailureLog_createdAt_idx"
  ON "JournalFailureLog" ("createdAt");

CREATE TABLE IF NOT EXISTS "BackfillAuditLock" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "checksumLedger" TEXT,
  "checksumWallet" TEXT,
  "lockedAt" TIMESTAMP(3),
  "lockedByActorId" UUID,
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackfillAuditLock_pkey" PRIMARY KEY ("id")
);

-- Generic append-only guard with session-flag bypass.
-- A migration / reset script that legitimately needs to mutate the
-- table sets `SET LOCAL "app.immutable_ledger_bypass" = 'true'` first.
CREATE OR REPLACE FUNCTION "v20_v4_append_only_guard"()
RETURNS trigger AS $$
DECLARE
  bypass_flag TEXT;
BEGIN
  BEGIN
    bypass_flag := current_setting('app.immutable_ledger_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    bypass_flag := NULL;
  END;
  IF bypass_flag = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION
    '% is append-only — % not allowed (set app.immutable_ledger_bypass=true to override)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

-- TransactionHistory append-only enforcement
DROP TRIGGER IF EXISTS "TransactionHistory_no_update" ON "TransactionHistory";
CREATE TRIGGER "TransactionHistory_no_update"
BEFORE UPDATE ON "TransactionHistory"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "TransactionHistory_no_delete" ON "TransactionHistory";
CREATE TRIGGER "TransactionHistory_no_delete"
BEFORE DELETE ON "TransactionHistory"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "TransactionHistory_no_truncate" ON "TransactionHistory";
CREATE TRIGGER "TransactionHistory_no_truncate"
BEFORE TRUNCATE ON "TransactionHistory"
FOR EACH STATEMENT EXECUTE FUNCTION "v20_v4_append_only_guard"();

-- JournalEntry append-only enforcement
DROP TRIGGER IF EXISTS "JournalEntry_no_update" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_update"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalEntry_no_delete" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_delete"
BEFORE DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalEntry_no_truncate" ON "JournalEntry";
CREATE TRIGGER "JournalEntry_no_truncate"
BEFORE TRUNCATE ON "JournalEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "v20_v4_append_only_guard"();

-- JournalLine append-only enforcement
DROP TRIGGER IF EXISTS "JournalLine_no_update" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_update"
BEFORE UPDATE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalLine_no_delete" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_delete"
BEFORE DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalLine_no_truncate" ON "JournalLine";
CREATE TRIGGER "JournalLine_no_truncate"
BEFORE TRUNCATE ON "JournalLine"
FOR EACH STATEMENT EXECUTE FUNCTION "v20_v4_append_only_guard"();

-- JournalFailureLog append-only enforcement
DROP TRIGGER IF EXISTS "JournalFailureLog_no_update" ON "JournalFailureLog";
CREATE TRIGGER "JournalFailureLog_no_update"
BEFORE UPDATE ON "JournalFailureLog"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalFailureLog_no_delete" ON "JournalFailureLog";
CREATE TRIGGER "JournalFailureLog_no_delete"
BEFORE DELETE ON "JournalFailureLog"
FOR EACH ROW EXECUTE FUNCTION "v20_v4_append_only_guard"();

DROP TRIGGER IF EXISTS "JournalFailureLog_no_truncate" ON "JournalFailureLog";
CREATE TRIGGER "JournalFailureLog_no_truncate"
BEFORE TRUNCATE ON "JournalFailureLog"
FOR EACH STATEMENT EXECUTE FUNCTION "v20_v4_append_only_guard"();
