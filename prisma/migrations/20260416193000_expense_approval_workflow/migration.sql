DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseStatus') THEN
    CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING_ACCOUNTANT', 'APPROVED', 'REJECTED', 'AUDIT');
  END IF;
END $$;

ALTER TABLE "BranchExpense"
  ADD COLUMN IF NOT EXISTS "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTANT';

ALTER TABLE "BranchExpense"
  ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;

UPDATE "BranchExpense"
SET "receiptUrl" = "receiptImageData"
WHERE "receiptUrl" IS NULL
  AND "receiptImageData" IS NOT NULL;

ALTER TABLE "BranchExpense"
  DROP COLUMN IF EXISTS "receiptImageData";

CREATE INDEX IF NOT EXISTS "BranchExpense_status_idx" ON "BranchExpense"("status");
