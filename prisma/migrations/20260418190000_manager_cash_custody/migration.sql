-- CreateEnum
CREATE TYPE "ManagerCashCustodyStatus" AS ENUM ('PENDING_DEPOSIT', 'AWAITING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "ManagerCashCustody" (
    "id" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "branchId" UUID,
    "shiftId" UUID,
    "amountKd" DECIMAL(19,4) NOT NULL,
    "settledOrderCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ManagerCashCustodyStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "receivedFromDriverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slipUploadedAt" TIMESTAMP(3),
    "depositSlipUrl" TEXT,
    "verifiedByAccountantId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectedByAccountantId" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerCashCustody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerCashCustody_managerId_status_idx" ON "ManagerCashCustody"("managerId", "status");

-- CreateIndex
CREATE INDEX "ManagerCashCustody_status_receivedFromDriverAt_idx" ON "ManagerCashCustody"("status", "receivedFromDriverAt");

-- CreateIndex
CREATE INDEX "ManagerCashCustody_branchId_idx" ON "ManagerCashCustody"("branchId");

-- CreateIndex
CREATE INDEX "ManagerCashCustody_shiftId_idx" ON "ManagerCashCustody"("shiftId");

-- CreateIndex
CREATE INDEX "ManagerCashCustody_driverId_idx" ON "ManagerCashCustody"("driverId");

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_verifiedByAccountantId_fkey" FOREIGN KEY ("verifiedByAccountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerCashCustody" ADD CONSTRAINT "ManagerCashCustody_rejectedByAccountantId_fkey" FOREIGN KEY ("rejectedByAccountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
