-- V19.x — Call-Center → Driver dispatch module
--
-- Purely ADDITIVE. Touches only:
--   * NEW enum  : DispatchStatus
--   * NEW table : Dispatch
--   * NEW col   : Order.dispatchId  (nullable, FK SET NULL)
--   * NEW idx   : Order.dispatchId, Dispatch composite indexes
--   * NEW FKs   : Dispatch.customerId, Dispatch.driverId,
--                 Dispatch.createdByUserId, Order.dispatchId
--
-- Does NOT modify any existing column, drop any index, or alter any
-- constraint on existing tables. Pre-existing schema-drift in
-- `audit_logs` (live DB has 10 columns the schema does not declare)
-- is intentionally LEFT ALONE — it predates this migration.

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('ASSIGNED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'ASSIGNED',
    "instructionNote" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "completedByOrderId" UUID,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_completedByOrderId_key" ON "Dispatch"("completedByOrderId");

-- CreateIndex
CREATE INDEX "Dispatch_driverId_status_createdAt_idx" ON "Dispatch"("driverId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispatch_customerId_createdAt_idx" ON "Dispatch"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispatch_status_createdAt_idx" ON "Dispatch"("status", "createdAt");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "dispatchId" UUID;

-- CreateIndex
CREATE INDEX "Order_dispatchId_idx" ON "Order"("dispatchId");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
