-- Stage-F Cosmetic · Purchase Order workflow.
-- supplier → PO (DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED | CANCELLED)
-- Each receipt creates StockMovement rows via InventoryService.stockIn(…).

-- 1. Enum ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseOrderStatus') THEN
    CREATE TYPE "PurchaseOrderStatus" AS ENUM (
      'DRAFT',
      'SENT',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
      'CANCELLED'
    );
  END IF;
END $$;

-- 2. PurchaseOrder -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "poNumber"        TEXT NOT NULL,
  "supplierId"      UUID NOT NULL,
  "branchId"        UUID NOT NULL,
  "status"          "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "totalKd"         DECIMAL(19,4) NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "expectedAt"      TIMESTAMP(3),
  "createdById"     UUID NOT NULL,
  "approvedById"    UUID,
  "approvedAt"      TIMESTAMP(3),
  "cancelledAt"     TIMESTAMP(3),
  "cancelledReason" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PurchaseOrder_poNumber_key" UNIQUE ("poNumber"),
  CONSTRAINT "PurchaseOrder_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx"
  ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_branchId_idx"
  ON "PurchaseOrder"("branchId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx"
  ON "PurchaseOrder"("status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdAt_idx"
  ON "PurchaseOrder"("createdAt");

-- 3. PurchaseOrderLine --------------------------------------------------
CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseOrderId"  UUID NOT NULL,
  "stockItemId"      UUID NOT NULL,
  "quantityOrdered"  DECIMAL(19,4) NOT NULL,
  "quantityReceived" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unitCost"         DECIMAL(19,4) NOT NULL,
  "lineTotal"        DECIMAL(19,4) NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderLine_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_purchaseOrderId_idx"
  ON "PurchaseOrderLine"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_stockItemId_idx"
  ON "PurchaseOrderLine"("stockItemId");

-- 4. PurchaseOrderReceipt ------------------------------------------------
CREATE TABLE IF NOT EXISTS "PurchaseOrderReceipt" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseOrderId" UUID NOT NULL,
  "receivedById"    UUID NOT NULL,
  "note"            TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PurchaseOrderReceipt_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderReceipt_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PurchaseOrderReceipt_purchaseOrderId_idx"
  ON "PurchaseOrderReceipt"("purchaseOrderId");

-- 5. PurchaseOrderReceiptLine -------------------------------------------
CREATE TABLE IF NOT EXISTS "PurchaseOrderReceiptLine" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "receiptId"           UUID NOT NULL,
  "purchaseOrderLineId" UUID NOT NULL,
  "stockItemId"         UUID NOT NULL,
  "quantityReceived"    DECIMAL(19,4) NOT NULL,
  "unitCost"            DECIMAL(19,4) NOT NULL,
  "stockMovementId"     UUID,

  CONSTRAINT "PurchaseOrderReceiptLine_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderReceiptLine_purchaseOrderLineId_fkey"
    FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderReceiptLine_stockItemId_fkey"
    FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PurchaseOrderReceiptLine_receiptId_idx"
  ON "PurchaseOrderReceiptLine"("receiptId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderReceiptLine_purchaseOrderLineId_idx"
  ON "PurchaseOrderReceiptLine"("purchaseOrderLineId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderReceiptLine_stockItemId_idx"
  ON "PurchaseOrderReceiptLine"("stockItemId");
