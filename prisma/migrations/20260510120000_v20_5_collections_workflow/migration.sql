-- V20.5 — Phase 3 Collections Workflow Engine.
--
-- Adds a per-customer CollectionsAccount that captures the
-- professional collections lifecycle (NEW → CONTACTED →
-- FOLLOW_UP → PROMISE_TO_PAY → ESCALATED → LEGAL → WRITTEN_OFF
-- → CLOSED) plus assigned collector, escalation level, and the
-- last stage transition timestamp.
--
-- This is ADDITIVE — the legacy `CustomerCollectionStatus` (which
-- is still consumed by older screens and only flips between
-- NORMAL/BLOCKED-style states) is left untouched. Both can coexist
-- forever; downstream UIs migrate at their own pace.
--
-- Append-only audit table: CollectionsStageEvent. DB triggers
-- block UPDATE/DELETE so the SLA / supervisor reports are
-- guaranteed forensic.

CREATE TYPE "CollectionsStage" AS ENUM (
  'NEW',
  'CONTACTED',
  'FOLLOW_UP',
  'PROMISE_TO_PAY',
  'ESCALATED',
  'LEGAL',
  'WRITTEN_OFF',
  'CLOSED'
);

CREATE TABLE "CollectionsAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "currentStage" "CollectionsStage" NOT NULL DEFAULT 'NEW',
  "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stageUpdatedById" UUID,
  "assignedCollectorId" UUID,
  "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "nextActionDueAt" TIMESTAMP(3),
  "writeOffAmountKd" DECIMAL(19,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionsAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionsAccount_customerId_key"
  ON "CollectionsAccount"("customerId");
CREATE INDEX "CollectionsAccount_currentStage_idx"
  ON "CollectionsAccount"("currentStage");
CREATE INDEX "CollectionsAccount_assignedCollectorId_idx"
  ON "CollectionsAccount"("assignedCollectorId");
CREATE INDEX "CollectionsAccount_nextActionDueAt_idx"
  ON "CollectionsAccount"("nextActionDueAt");

ALTER TABLE "CollectionsAccount"
  ADD CONSTRAINT "CollectionsAccount_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionsAccount"
  ADD CONSTRAINT "CollectionsAccount_assignedCollectorId_fkey"
  FOREIGN KEY ("assignedCollectorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionsAccount"
  ADD CONSTRAINT "CollectionsAccount_stageUpdatedById_fkey"
  FOREIGN KEY ("stageUpdatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CollectionsStageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "fromStage" "CollectionsStage",
  "toStage" "CollectionsStage" NOT NULL,
  "actorId" UUID,
  "reason" TEXT,
  "payload" JSONB,
  "escalationLevelBefore" INTEGER,
  "escalationLevelAfter" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionsStageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectionsStageEvent_accountId_createdAt_idx"
  ON "CollectionsStageEvent"("accountId", "createdAt");
CREATE INDEX "CollectionsStageEvent_toStage_createdAt_idx"
  ON "CollectionsStageEvent"("toStage", "createdAt");

ALTER TABLE "CollectionsStageEvent"
  ADD CONSTRAINT "CollectionsStageEvent_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CollectionsAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionsStageEvent"
  ADD CONSTRAINT "CollectionsStageEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "CollectionsStageEvent_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'CollectionsStageEvent rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CollectionsStageEvent_no_update" ON "CollectionsStageEvent";
CREATE TRIGGER "CollectionsStageEvent_no_update"
BEFORE UPDATE ON "CollectionsStageEvent"
FOR EACH ROW EXECUTE FUNCTION "CollectionsStageEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "CollectionsStageEvent_no_delete" ON "CollectionsStageEvent";
CREATE TRIGGER "CollectionsStageEvent_no_delete"
BEFORE DELETE ON "CollectionsStageEvent"
FOR EACH ROW EXECUTE FUNCTION "CollectionsStageEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "CollectionsStageEvent_no_truncate" ON "CollectionsStageEvent";
CREATE TRIGGER "CollectionsStageEvent_no_truncate"
BEFORE TRUNCATE ON "CollectionsStageEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "CollectionsStageEvent_append_only_guard"();
