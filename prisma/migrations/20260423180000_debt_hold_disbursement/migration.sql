-- V19.17 — Decouple DebtHold release from the payroll cycle.
--
-- The release of a previously HELD slip is now a voucher-style
-- disbursement that the Owner/GM pays out SEPARATELY from the monthly
-- salary run. These two fields track when / who completed that
-- disbursement, letting us keep "status = RELEASED" meaning "owed
-- back to employee" and "disbursedAt IS NOT NULL" meaning "fully
-- paid out".

ALTER TABLE "DebtHold"
  ADD COLUMN IF NOT EXISTS "disbursedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "disbursedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DebtHold_disbursedById_fkey'
  ) THEN
    ALTER TABLE "DebtHold"
      ADD CONSTRAINT "DebtHold_disbursedById_fkey"
      FOREIGN KEY ("disbursedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DebtHold_status_disbursedAt_idx"
  ON "DebtHold" ("status", "disbursedAt");
