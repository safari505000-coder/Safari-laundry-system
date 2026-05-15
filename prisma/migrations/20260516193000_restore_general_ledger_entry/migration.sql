-- Restore legacy single-entry ledger table used by read-side KPIs and tests.
-- Some environments had this model in Prisma schema/client without a matching migration.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'GeneralLedgerEntryType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "GeneralLedgerEntryType" AS ENUM (
      'POS_SALE_COMPLETED',
      'EXPENSE_RECORDED',
      'WALLET_SETTLEMENT',
      'DEBT_ADJUSTMENT'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GeneralLedgerEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entryType" "GeneralLedgerEntryType" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "memo" TEXT,
  "metadata" JSONB,
  "customerId" UUID,
  "orderId" UUID,
  "expenseId" UUID,
  "actorUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeneralLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GeneralLedgerEntry_entryType_createdAt_idx"
  ON "GeneralLedgerEntry"("entryType", "createdAt");

CREATE INDEX IF NOT EXISTS "GeneralLedgerEntry_actorUserId_createdAt_idx"
  ON "GeneralLedgerEntry"("actorUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "GeneralLedgerEntry_orderId_idx"
  ON "GeneralLedgerEntry"("orderId");

CREATE INDEX IF NOT EXISTS "GeneralLedgerEntry_expenseId_idx"
  ON "GeneralLedgerEntry"("expenseId");
