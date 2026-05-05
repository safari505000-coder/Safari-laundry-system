-- B2C portal: CUSTOMER role + optional link to Customer row for JWT scoping.
ALTER TYPE "SafariRole" ADD VALUE IF NOT EXISTS 'CUSTOMER';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "linkedCustomerId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_linkedCustomerId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_linkedCustomerId_fkey"
      FOREIGN KEY ("linkedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_linkedCustomerId_idx" ON "User"("linkedCustomerId");
