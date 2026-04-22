-- V1.7.0 — UPayments (or compatible provider) gateway audit columns.
-- `posGatewayTrackId` stores the provider's charge trackId so the
-- webhook handler can re-query the gateway for the authoritative
-- payment status instead of trusting the webhook body blindly.
-- `posGatewayMetadata` keeps the raw charge/callback/inquiry payloads
-- for audit and support tickets. Both are nullable and additive —
-- existing orders and the mock-checkout flow continue to work
-- unchanged.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "posGatewayTrackId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "posGatewayMetadata" JSONB;

CREATE INDEX IF NOT EXISTS "Order_posGatewayTrackId_idx"
  ON "Order" ("posGatewayTrackId");
