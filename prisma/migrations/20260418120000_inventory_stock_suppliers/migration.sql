-- Dastur §4 Smart Inventory: non-laundry operational supplies, stock-in with
-- supplier + cost, per-branch quantities, immutable movement audit.

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_code_key" ON "InventoryCategory"("code");

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "categoryId" UUID,
    "reorderPointDefault" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lastUnitCost" DECIMAL(19,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_code_key" ON "StockItem"("code");

-- CreateIndex
CREATE INDEX "StockItem_categoryId_idx" ON "StockItem"("categoryId");

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BranchStockLevel" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "stockItemId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(19,4),
    "avgUnitCost" DECIMAL(19,4),
    "lastMovementAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchStockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchStockLevel_branchId_stockItemId_key" ON "BranchStockLevel"("branchId", "stockItemId");

-- CreateIndex
CREATE INDEX "BranchStockLevel_branchId_idx" ON "BranchStockLevel"("branchId");

-- CreateIndex
CREATE INDEX "BranchStockLevel_stockItemId_idx" ON "BranchStockLevel"("stockItemId");

-- AddForeignKey
ALTER TABLE "BranchStockLevel" ADD CONSTRAINT "BranchStockLevel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockLevel" ADD CONSTRAINT "BranchStockLevel_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "stockItemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4),
    "totalCost" DECIMAL(19,4),
    "supplierId" UUID,
    "recordedById" UUID NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_idx" ON "StockMovement"("stockItemId");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_idx" ON "StockMovement"("branchId");

-- CreateIndex
CREATE INDEX "StockMovement_supplierId_idx" ON "StockMovement"("supplierId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
