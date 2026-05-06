-- V19.x — Outstanding-Payments / Accounts-Receivable module.
--
-- Strictly additive migration: extends `Order` with an optional
-- `dueDate`, registers a new `CustomerCollectionStatus` row (one per
-- customer) and the matching `CustomerCollectionStatusKind` enum.
--
-- Blocking remains MANUAL ONLY: nothing in the codebase auto-flips
-- `blocked` from a cron / order hook. The single writer is the
-- call-centre PATCH /api/finance/customer/:id/status endpoint.

-- 1) Order: optional payment-due date used to compute daysLate / priority.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

-- 2) Order: supporting indexes for the AR aggregator.
CREATE INDEX IF NOT EXISTS "Order_customerId_driverId_createdAt_idx"
  ON "Order" ("customerId", "driverId", "createdAt");

CREATE INDEX IF NOT EXISTS "Order_customerId_cashStatus_idx"
  ON "Order" ("customerId", "cashStatus");

CREATE INDEX IF NOT EXISTS "Order_dueDate_idx"
  ON "Order" ("dueDate");

-- 3) New enum for the AR status colour.
DO $$
BEGIN
  CREATE TYPE "CustomerCollectionStatusKind" AS ENUM ('NORMAL', 'LATE', 'RISK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 4) New table: one collection row per customer.
CREATE TABLE IF NOT EXISTS "CustomerCollectionStatus" (
  "id"          UUID                              NOT NULL,
  "customerId"  UUID                              NOT NULL,
  "status"      "CustomerCollectionStatusKind"    NOT NULL DEFAULT 'NORMAL',
  "blocked"     BOOLEAN                           NOT NULL DEFAULT false,
  "note"        TEXT,
  "updatedAt"   TIMESTAMP(3)                      NOT NULL,
  "updatedById" UUID,

  CONSTRAINT "CustomerCollectionStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCollectionStatus_customerId_key"
  ON "CustomerCollectionStatus" ("customerId");

CREATE INDEX IF NOT EXISTS "CustomerCollectionStatus_status_idx"
  ON "CustomerCollectionStatus" ("status");

CREATE INDEX IF NOT EXISTS "CustomerCollectionStatus_blocked_idx"
  ON "CustomerCollectionStatus" ("blocked");

-- 5) Foreign keys (idempotent).
DO $$
BEGIN
  ALTER TABLE "CustomerCollectionStatus"
    ADD CONSTRAINT "CustomerCollectionStatus_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "CustomerCollectionStatus"
    ADD CONSTRAINT "CustomerCollectionStatus_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
