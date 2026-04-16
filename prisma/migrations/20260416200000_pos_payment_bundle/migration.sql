-- CreateTable
CREATE TABLE "PosPaymentBundle" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "totalAmountKd" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosPaymentBundle_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "posPaymentBundleId" UUID;

-- CreateIndex
CREATE INDEX "Order_posPaymentBundleId_idx" ON "Order"("posPaymentBundleId");

-- AddForeignKey
ALTER TABLE "PosPaymentBundle" ADD CONSTRAINT "PosPaymentBundle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_posPaymentBundleId_fkey" FOREIGN KEY ("posPaymentBundleId") REFERENCES "PosPaymentBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
