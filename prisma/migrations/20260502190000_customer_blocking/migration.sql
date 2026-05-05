-- Customer blocking and block-override audit linkage.
ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockReason" TEXT,
  ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);

ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "customerId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_customerId_fkey'
  ) THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Customer_isBlocked_idx" ON "Customer"("isBlocked");
CREATE INDEX IF NOT EXISTS "audit_logs_customerId_timestamp_idx" ON "audit_logs"("customerId", "timestamp");
