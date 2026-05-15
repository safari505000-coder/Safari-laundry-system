-- Restore driver deposit table used by the deposits workflow.
-- The Prisma schema/client references Deposit, but older migration history did not create it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DepositType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "DepositType" AS ENUM ('CASH', 'KNET');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'DepositStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Deposit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "driverId" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "type" "DepositType" NOT NULL,
  "receiptImage" TEXT NOT NULL,
  "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
  "auditComment" TEXT,
  "auditedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Deposit_driverId_status_createdAt_idx"
  ON "Deposit"("driverId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Deposit_status_createdAt_idx"
  ON "Deposit"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Deposit_auditedById_idx"
  ON "Deposit"("auditedById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Deposit_driverId_fkey'
  ) THEN
    ALTER TABLE "Deposit"
      ADD CONSTRAINT "Deposit_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Deposit_auditedById_fkey'
  ) THEN
    ALTER TABLE "Deposit"
      ADD CONSTRAINT "Deposit_auditedById_fkey"
      FOREIGN KEY ("auditedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
