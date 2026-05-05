ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "orderId" UUID,
  ADD COLUMN IF NOT EXISTS "amount" DECIMAL(19, 4),
  ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_orderId_timestamp_idx"
  ON "audit_logs"("orderId", "timestamp");
