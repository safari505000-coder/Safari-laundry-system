-- CreateTable
CREATE TABLE "LaundryItemCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaundryItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaundryItemCategory_code_key" ON "LaundryItemCategory"("code");

-- AlterTable
ALTER TABLE "LaundryPriceListItem" ADD COLUMN "categoryId" UUID;

-- CreateIndex
CREATE INDEX "LaundryPriceListItem_categoryId_idx" ON "LaundryPriceListItem"("categoryId");

-- AddForeignKey
ALTER TABLE "LaundryPriceListItem" ADD CONSTRAINT "LaundryPriceListItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LaundryItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LaundryBranchItemPrice" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "laundryPriceListItemId" UUID NOT NULL,
    "priceNormal" DECIMAL(19,4),
    "priceUrgent" DECIMAL(19,4),
    "pricePressOnly" DECIMAL(19,4),
    "priceUrgentPress" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaundryBranchItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LaundryBranchItemPrice_branchId_laundryPriceListItemId_key" ON "LaundryBranchItemPrice"("branchId", "laundryPriceListItemId");

-- CreateIndex
CREATE INDEX "LaundryBranchItemPrice_branchId_idx" ON "LaundryBranchItemPrice"("branchId");

-- AddForeignKey
ALTER TABLE "LaundryBranchItemPrice" ADD CONSTRAINT "LaundryBranchItemPrice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaundryBranchItemPrice" ADD CONSTRAINT "LaundryBranchItemPrice_laundryPriceListItemId_fkey" FOREIGN KEY ("laundryPriceListItemId") REFERENCES "LaundryPriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
