-- CashIntelExecutionEvent — append-only audit ledger that replaces the
-- in-memory CashExecutionTrackerService store. See the Prisma model
-- for the contract.

DO $$ BEGIN
  CREATE TYPE "CashIntelExecutionEventType" AS ENUM (
    'ACTION_LOGGED',
    'RISK_ENTERED',
    'AUTO_RESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CashIntelExecutionAction" AS ENUM (
    'CONTACTED',
    'FOLLOWED_UP',
    'ESCALATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CashIntelExecutionStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CashIntelExecutionEvent" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "driverId"    UUID NOT NULL,
  "eventType"   "CashIntelExecutionEventType" NOT NULL,
  "action"      "CashIntelExecutionAction",
  "resultStatus" "CashIntelExecutionStatus" NOT NULL,
  "alertType"   TEXT,
  "note"        TEXT,
  "actorUserId" UUID,
  "occurredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CashIntelExecutionEvent_driverId_occurredAt_idx"
  ON "CashIntelExecutionEvent"("driverId", "occurredAt" DESC);

CREATE INDEX IF NOT EXISTS "CashIntelExecutionEvent_eventType_occurredAt_idx"
  ON "CashIntelExecutionEvent"("eventType", "occurredAt");
