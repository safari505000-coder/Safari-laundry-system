CREATE TYPE "BankDepositStatus" AS ENUM ('PENDING', 'VERIFIED');

ALTER TABLE "BankDepositLog"
  ADD COLUMN "status" "BankDepositStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "managerCashCustodyId" UUID;

UPDATE "BankDepositLog"
SET "status" = CASE WHEN "verifiedAt" IS NULL THEN 'PENDING'::"BankDepositStatus" ELSE 'VERIFIED'::"BankDepositStatus" END;

UPDATE "BankDepositLog" b
SET
  "managerCashCustodyId" = c."id",
  "status" = CASE WHEN b."verifiedAt" IS NULL THEN b."status" ELSE 'VERIFIED'::"BankDepositStatus" END
FROM "ManagerCashCustody" c
WHERE b."managerCashCustodyId" IS NULL
  AND c."depositSlipUrl" IS NOT NULL
  AND b."shiftId" = c."shiftId"
  AND b."receiptImageUrl" = c."depositSlipUrl"
  AND b."amountKd" = c."amountKd";

INSERT INTO "BankDepositLog" (
  "id",
  "depositType",
  "status",
  "amountKd",
  "receiptImageUrl",
  "shiftId",
  "managerCashCustodyId",
  "uploadedById",
  "verifiedByAccountantId",
  "verifiedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'CASH_DEPOSIT_SLIP'::"BankDepositType",
  'VERIFIED'::"BankDepositStatus",
  c."amountKd",
  c."depositSlipUrl",
  c."shiftId",
  c."id",
  c."managerId",
  c."verifiedByAccountantId",
  c."verifiedAt",
  COALESCE(c."slipUploadedAt", c."receivedFromDriverAt", c."createdAt"),
  NOW()
FROM "ManagerCashCustody" c
WHERE c."status" = 'VERIFIED'
  AND c."depositSlipUrl" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "BankDepositLog" b
    WHERE b."managerCashCustodyId" = c."id"
       OR (
         b."shiftId" = c."shiftId"
         AND b."receiptImageUrl" = c."depositSlipUrl"
         AND b."amountKd" = c."amountKd"
       )
  );

CREATE UNIQUE INDEX "BankDepositLog_managerCashCustodyId_key" ON "BankDepositLog"("managerCashCustodyId");
CREATE INDEX "BankDepositLog_status_idx" ON "BankDepositLog"("status");
CREATE INDEX "BankDepositLog_shiftId_idx" ON "BankDepositLog"("shiftId");

ALTER TABLE "BankDepositLog"
  ADD CONSTRAINT "BankDepositLog_managerCashCustodyId_fkey"
  FOREIGN KEY ("managerCashCustodyId") REFERENCES "ManagerCashCustody"("id") ON DELETE SET NULL ON UPDATE CASCADE;
