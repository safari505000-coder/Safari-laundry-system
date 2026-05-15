-- Restore fixed expense schedule table used by recurring branch overhead reports.
-- The Prisma schema/client references FixedExpenseSchedule, but older migration history did not create it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'FixedExpenseCategory'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "FixedExpenseCategory" AS ENUM (
      'RENT',
      'ELECTRICITY',
      'LEASE',
      'OTHER'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FixedExpenseSchedule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "branchId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "category" "FixedExpenseCategory" NOT NULL,
  "monthlyAmount" DECIMAL(19,4) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FixedExpenseSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FixedExpenseSchedule_branchId_idx"
  ON "FixedExpenseSchedule"("branchId");

CREATE INDEX IF NOT EXISTS "FixedExpenseSchedule_isActive_idx"
  ON "FixedExpenseSchedule"("isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FixedExpenseSchedule_branchId_fkey'
  ) THEN
    ALTER TABLE "FixedExpenseSchedule"
      ADD CONSTRAINT "FixedExpenseSchedule_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
