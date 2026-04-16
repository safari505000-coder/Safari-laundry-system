-- CreateEnum
CREATE TYPE "BankDepositType" AS ENUM ('CASH_DEPOSIT_SLIP', 'KNET_Z_REPORT');

-- CreateTable
CREATE TABLE "BankDepositLog" (
    "id" UUID NOT NULL,
    "depositType" "BankDepositType" NOT NULL,
    "amountKd" DECIMAL(19,4) NOT NULL,
    "receiptImageUrl" TEXT NOT NULL,
    "shiftId" UUID,
    "uploadedById" UUID NOT NULL,
    "verifiedByAccountantId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankDepositLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankDepositLog_createdAt_idx" ON "BankDepositLog"("createdAt");

-- CreateIndex
CREATE INDEX "BankDepositLog_uploadedById_idx" ON "BankDepositLog"("uploadedById");

-- CreateIndex
CREATE INDEX "BankDepositLog_verifiedByAccountantId_idx" ON "BankDepositLog"("verifiedByAccountantId");

-- AddForeignKey
ALTER TABLE "BankDepositLog" ADD CONSTRAINT "BankDepositLog_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankDepositLog" ADD CONSTRAINT "BankDepositLog_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankDepositLog" ADD CONSTRAINT "BankDepositLog_verifiedByAccountantId_fkey" FOREIGN KEY ("verifiedByAccountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
