DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseCategory') THEN
    CREATE TYPE "ExpenseCategory" AS ENUM ('SOAP', 'FUEL', 'MISC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseMethod') THEN
    CREATE TYPE "ExpenseMethod" AS ENUM ('CASH', 'PREPAID_CARD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseStatus') THEN
    CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING_ACCOUNTANT', 'APPROVED', 'REJECTED', 'AUDIT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BranchExpense" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "category" "ExpenseCategory" NOT NULL,
  "expenseMethod" "ExpenseMethod" NOT NULL DEFAULT 'CASH',
  "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTANT',
  "note" TEXT,
  "receiptUrl" TEXT,
  "recordedById" UUID NOT NULL,
  "branchId" UUID,
  "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BranchExpense_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BranchExpense"
  ADD COLUMN IF NOT EXISTS "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTANT';

ALTER TABLE "BranchExpense"
  ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'BranchExpense'
      AND column_name = 'receiptImageData'
  ) THEN
    UPDATE "BranchExpense"
    SET "receiptUrl" = "receiptImageData"
    WHERE "receiptUrl" IS NULL
      AND "receiptImageData" IS NOT NULL;
  END IF;
END $$;

ALTER TABLE "BranchExpense"
  DROP COLUMN IF EXISTS "receiptImageData";

CREATE INDEX IF NOT EXISTS "BranchExpense_status_idx" ON "BranchExpense"("status");
CREATE INDEX IF NOT EXISTS "BranchExpense_expenseDate_idx" ON "BranchExpense"("expenseDate");
CREATE INDEX IF NOT EXISTS "BranchExpense_recordedById_idx" ON "BranchExpense"("recordedById");
CREATE INDEX IF NOT EXISTS "BranchExpense_branchId_idx" ON "BranchExpense"("branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchExpense_recordedById_fkey'
  ) THEN
    ALTER TABLE "BranchExpense"
      ADD CONSTRAINT "BranchExpense_recordedById_fkey"
      FOREIGN KEY ("recordedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchExpense_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchExpense"
      ADD CONSTRAINT "BranchExpense_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
