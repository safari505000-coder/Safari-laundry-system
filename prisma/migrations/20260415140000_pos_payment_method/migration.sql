-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('SUBSCRIPTION_WALLET', 'CASH', 'KNET', 'PAYMENT_LINK');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "posPaymentMethod" "PosPaymentMethod";
ALTER TABLE "Order" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_completedAt_idx" ON "Order"("completedAt");
CREATE INDEX "Order_posPaymentMethod_idx" ON "Order"("posPaymentMethod");
