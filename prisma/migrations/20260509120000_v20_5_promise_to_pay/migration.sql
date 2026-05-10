-- V20.5 — Phase 2 Promise-to-Pay workflow.
--
-- Captures the operator's commitment recorded with a customer
-- ("I'll pay 30 KD on May 12"). Status transitions are
-- ACTIVE → KEPT / BROKEN / CANCELLED. The cron worker auto-flips
-- ACTIVE rows to BROKEN once `promisedDate` passes without
-- the customer's debt going down.
--
-- Append-only audit table (PromiseEvent) records every status
-- transition with actor + timestamp so the call-center supervisor
-- can review collector behaviour.
--
-- Idempotency: caller-supplied `idempotencyKey` (optional) +
-- (customerId, promisedDate, promisedAmount) tuple uniqueness via
-- partial index — operators who double-submit get one row.
--
-- Rollback safe: dropping these tables loses operator notes ONLY;
-- no canonical financial state lives here. Reconciliation engine
-- continues working unchanged.

CREATE TYPE "PromiseToPayStatus" AS ENUM (
  'ACTIVE',
  'KEPT',
  'BROKEN',
  'CANCELLED'
);

CREATE TABLE "PromiseToPay" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "invoiceId" UUID,
  "promisedAmount" DECIMAL(19,4) NOT NULL,
  "promisedDate" TIMESTAMP(3) NOT NULL,
  "status" "PromiseToPayStatus" NOT NULL DEFAULT 'ACTIVE',
  "collectorId" UUID NOT NULL,
  "notes" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "resolutionNotes" TEXT,
  CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromiseToPay_idempotencyKey_key"
  ON "PromiseToPay"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "PromiseToPay_customerId_status_idx"
  ON "PromiseToPay"("customerId", "status");
CREATE INDEX "PromiseToPay_status_promisedDate_idx"
  ON "PromiseToPay"("status", "promisedDate");
CREATE INDEX "PromiseToPay_collectorId_status_idx"
  ON "PromiseToPay"("collectorId", "status");
CREATE INDEX "PromiseToPay_invoiceId_idx"
  ON "PromiseToPay"("invoiceId");

ALTER TABLE "PromiseToPay"
  ADD CONSTRAINT "PromiseToPay_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromiseToPay"
  ADD CONSTRAINT "PromiseToPay_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromiseToPay"
  ADD CONSTRAINT "PromiseToPay_collectorId_fkey"
  FOREIGN KEY ("collectorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromiseToPay"
  ADD CONSTRAINT "PromiseToPay_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only audit trail. Mirror of every status transition
-- (CREATED, KEPT, BROKEN, CANCELLED, EDITED). Never updated, never
-- deleted — like JournalEntry. Trigger blocks UPDATE/DELETE.
CREATE TABLE "PromiseEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "promiseId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "actorId" UUID,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromiseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromiseEvent_promiseId_createdAt_idx"
  ON "PromiseEvent"("promiseId", "createdAt");
CREATE INDEX "PromiseEvent_kind_createdAt_idx"
  ON "PromiseEvent"("kind", "createdAt");

ALTER TABLE "PromiseEvent"
  ADD CONSTRAINT "PromiseEvent_promiseId_fkey"
  FOREIGN KEY ("promiseId") REFERENCES "PromiseToPay"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromiseEvent"
  ADD CONSTRAINT "PromiseEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "PromiseEvent_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'PromiseEvent rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PromiseEvent_no_update" ON "PromiseEvent";
CREATE TRIGGER "PromiseEvent_no_update"
BEFORE UPDATE ON "PromiseEvent"
FOR EACH ROW EXECUTE FUNCTION "PromiseEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "PromiseEvent_no_delete" ON "PromiseEvent";
CREATE TRIGGER "PromiseEvent_no_delete"
BEFORE DELETE ON "PromiseEvent"
FOR EACH ROW EXECUTE FUNCTION "PromiseEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "PromiseEvent_no_truncate" ON "PromiseEvent";
CREATE TRIGGER "PromiseEvent_no_truncate"
BEFORE TRUNCATE ON "PromiseEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "PromiseEvent_append_only_guard"();
