-- Restore customer branch attribution column used by branch-scoped reporting.
-- Prisma expects the quoted camelCase column name "originBranchId".

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "originBranchId" UUID;

CREATE INDEX IF NOT EXISTS "Customer_originBranchId_idx"
  ON "Customer"("originBranchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Customer_originBranchId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_originBranchId_fkey"
      FOREIGN KEY ("originBranchId") REFERENCES "Branch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
