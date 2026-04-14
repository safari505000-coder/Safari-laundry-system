-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "validityDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "CustomerWallet" ADD COLUMN "subscriptionActivatedAt" TIMESTAMP(3),
ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN "subscriptionPlanId" UUID,
ADD COLUMN "subscriptionPlanName" TEXT;

-- AddForeignKey
ALTER TABLE "CustomerWallet" ADD CONSTRAINT "CustomerWallet_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CustomerWallet_subscriptionExpiresAt_idx" ON "CustomerWallet"("subscriptionExpiresAt");
