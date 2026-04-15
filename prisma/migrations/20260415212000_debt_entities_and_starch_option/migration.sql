-- Add ONLINE payment method to keep KNET and ONLINE distinct.
ALTER TYPE "PosPaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE';

-- Starch option for order line items.
CREATE TYPE "StarchOption" AS ENUM ('NONE', 'STARCH_25');
ALTER TABLE "OrderLineItem"
ADD COLUMN "starchOption" "StarchOption" NOT NULL DEFAULT 'NONE';

-- Structured debt tracking.
CREATE TYPE "DebtSource" AS ENUM ('SUBSCRIPTION_OVERUSE', 'INVOICE_SHORTFALL');
CREATE TYPE "DebtEntityCategory" AS ENUM ('BRANCH', 'DRIVER', 'OWNER', 'CALL_CENTER');

CREATE TABLE "DebtLedgerEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "orderId" UUID,
  "source" "DebtSource" NOT NULL,
  "category" "DebtEntityCategory" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "branchId" UUID,
  "actorUserId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DebtLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtLedgerEntry_customerId_createdAt_idx"
  ON "DebtLedgerEntry"("customerId", "createdAt");
CREATE INDEX "DebtLedgerEntry_source_category_createdAt_idx"
  ON "DebtLedgerEntry"("source", "category", "createdAt");
CREATE INDEX "DebtLedgerEntry_orderId_idx"
  ON "DebtLedgerEntry"("orderId");
CREATE INDEX "DebtLedgerEntry_branchId_idx"
  ON "DebtLedgerEntry"("branchId");

ALTER TABLE "DebtLedgerEntry"
ADD CONSTRAINT "DebtLedgerEntry_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DebtLedgerEntry"
ADD CONSTRAINT "DebtLedgerEntry_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DebtLedgerEntry"
ADD CONSTRAINT "DebtLedgerEntry_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DebtLedgerEntry"
ADD CONSTRAINT "DebtLedgerEntry_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
