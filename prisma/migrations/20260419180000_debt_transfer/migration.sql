-- V19.3 · Dastur §5 — Debt Transfer document workflow.
-- Adds:
--   • DebtTransferStatus enum
--   • DebtTransfer + DebtTransferOrder tables
--   • Order.transferredFromDriverId audit column + index

-- 1. Enum ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DebtTransferStatus') THEN
    CREATE TYPE "DebtTransferStatus" AS ENUM (
      'DRAFT',
      'AWAITING_SIGNATURES',
      'COMPLETED',
      'CANCELLED'
    );
  END IF;
END $$;

-- 2. Order audit column -------------------------------------------------
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "transferredFromDriverId" UUID;

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_transferredFromDriverId_fkey";

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_transferredFromDriverId_fkey"
  FOREIGN KEY ("transferredFromDriverId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Order_transferredFromDriverId_idx"
  ON "Order"("transferredFromDriverId");

-- 3. DebtTransfer -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DebtTransfer" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceDriverId"  UUID NOT NULL,
  "targetDriverId"  UUID NOT NULL,
  "totalAmount"     DECIMAL(19,4) NOT NULL,
  "orderCount"      INTEGER NOT NULL DEFAULT 0,
  "reason"          TEXT,
  "notes"           TEXT,
  "status"          "DebtTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "executedById"    UUID NOT NULL,
  "executedByRole"  "SafariRole" NOT NULL,
  "sourceSignedAt"  TIMESTAMP(3),
  "targetSignedAt"  TIMESTAMP(3),
  "finalizedAt"     TIMESTAMP(3),
  "cancelledAt"     TIMESTAMP(3),
  "cancelledReason" TEXT,
  "cancelledById"   UUID,
  "systemSignature" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DebtTransfer_sourceDriverId_fkey"
    FOREIGN KEY ("sourceDriverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebtTransfer_targetDriverId_fkey"
    FOREIGN KEY ("targetDriverId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebtTransfer_executedById_fkey"
    FOREIGN KEY ("executedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebtTransfer_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DebtTransfer_sourceDriverId_createdAt_idx"
  ON "DebtTransfer"("sourceDriverId", "createdAt");
CREATE INDEX IF NOT EXISTS "DebtTransfer_targetDriverId_createdAt_idx"
  ON "DebtTransfer"("targetDriverId", "createdAt");
CREATE INDEX IF NOT EXISTS "DebtTransfer_status_createdAt_idx"
  ON "DebtTransfer"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DebtTransfer_executedById_createdAt_idx"
  ON "DebtTransfer"("executedById", "createdAt");
CREATE INDEX IF NOT EXISTS "DebtTransfer_createdAt_idx"
  ON "DebtTransfer"("createdAt");

-- 4. DebtTransferOrder --------------------------------------------------
CREATE TABLE IF NOT EXISTS "DebtTransferOrder" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "debtTransferId" UUID NOT NULL,
  "orderId"        UUID NOT NULL,
  "amountSnapshot" DECIMAL(19,4) NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DebtTransferOrder_debtTransferId_fkey"
    FOREIGN KEY ("debtTransferId") REFERENCES "DebtTransfer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DebtTransferOrder_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DebtTransferOrder_debtTransferId_idx"
  ON "DebtTransferOrder"("debtTransferId");
CREATE INDEX IF NOT EXISTS "DebtTransferOrder_orderId_idx"
  ON "DebtTransferOrder"("orderId");
