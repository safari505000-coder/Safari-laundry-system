-- V19.9 — InvoiceAuditLog: immutable trail of Call-Center Supervisor
-- same-day invoice edits and soft-voids. The write path is a single
-- Prisma transaction that updates the order AND inserts exactly one
-- row here, so Sum(financialImpactFils) over any day MUST equal the
-- delta between the old and new GL running totals.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InvoiceAuditAction" AS ENUM ('EDIT', 'VOID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceAuditLog" (
  "id"                  UUID NOT NULL,
  "orderId"             UUID NOT NULL,
  "action"              "InvoiceAuditAction" NOT NULL,
  "actorId"             UUID NOT NULL,
  "actorRole"           "SafariRole" NOT NULL,
  "actorName"           TEXT NOT NULL,
  "beforeSnapshot"      JSONB NOT NULL,
  "afterSnapshot"       JSONB NOT NULL,
  "changedFields"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reason"              TEXT,
  "financialImpactFils" BIGINT NOT NULL DEFAULT 0,
  "kuwaitDay"           CHAR(10) NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_orderId_idx"
  ON "InvoiceAuditLog"("orderId");
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_actorId_idx"
  ON "InvoiceAuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_kuwaitDay_idx"
  ON "InvoiceAuditLog"("kuwaitDay");
CREATE INDEX IF NOT EXISTS "InvoiceAuditLog_action_createdAt_idx"
  ON "InvoiceAuditLog"("action", "createdAt");

-- AddForeignKey (Order: CASCADE so voided orders keep their trail if
-- the order row is purged by a future backup-prune).
DO $$ BEGIN
  ALTER TABLE "InvoiceAuditLog"
    ADD CONSTRAINT "InvoiceAuditLog_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (Actor: RESTRICT so the actor user can never be hard-
-- deleted while an audit trail row still references them.)
DO $$ BEGIN
  ALTER TABLE "InvoiceAuditLog"
    ADD CONSTRAINT "InvoiceAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
