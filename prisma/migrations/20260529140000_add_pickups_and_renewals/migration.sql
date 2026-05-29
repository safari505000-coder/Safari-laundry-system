-- AlterTable
ALTER TABLE "CustomerWallet" ADD COLUMN     "autoRenewSubscription" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerPickupSchedule" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeWindow" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPickupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPaymentCard" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "gatewayToken" TEXT NOT NULL,
    "cardBrand" TEXT NOT NULL,
    "maskedPan" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPaymentCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPickupSchedule_customerId_idx" ON "CustomerPickupSchedule"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPickupSchedule_customerId_dayOfWeek_key" ON "CustomerPickupSchedule"("customerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "SavedPaymentCard_customerId_idx" ON "SavedPaymentCard"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerPickupSchedule" ADD CONSTRAINT "CustomerPickupSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPaymentCard" ADD CONSTRAINT "SavedPaymentCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
