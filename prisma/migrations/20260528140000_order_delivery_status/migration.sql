-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED_TO_BRANCH');

-- CreateEnum
CREATE TYPE "DeliveryReturnReason" AS ENUM ('NO_ANSWER', 'WRONG_ADDRESS', 'REFUSED', 'OTHER');

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "deliveryStartedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "returnedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryReturnReason" "DeliveryReturnReason",
  ADD COLUMN "deliveryDriverId" UUID;

-- CreateTable
CREATE TABLE "OrderDeliveryEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "fromStatus" "DeliveryStatus" NOT NULL,
    "toStatus" "DeliveryStatus" NOT NULL,
    "returnReason" "DeliveryReturnReason",
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");

-- CreateIndex
CREATE INDEX "Order_deliveryDriverId_idx" ON "Order"("deliveryDriverId");

-- CreateIndex
CREATE INDEX "OrderDeliveryEvent_orderId_createdAt_idx" ON "OrderDeliveryEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderDeliveryEvent_actorUserId_idx" ON "OrderDeliveryEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryDriverId_fkey" FOREIGN KEY ("deliveryDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliveryEvent" ADD CONSTRAINT "OrderDeliveryEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliveryEvent" ADD CONSTRAINT "OrderDeliveryEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
