-- Public website intake queue.
-- These rows are call-center work items only: no invoices, no journal entries.

DO $$
BEGIN
  CREATE TYPE "WebsiteOrderRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WebsiteOrderRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "status" "WebsiteOrderRequestStatus" NOT NULL DEFAULT 'NEW',
  "customerId" UUID,
  "customerPhone" TEXT NOT NULL,
  "customerDisplayName" TEXT,
  "customerAddress" TEXT,
  "serviceType" "ServiceType" NOT NULL DEFAULT 'NORMAL',
  "notes" TEXT,
  "requestedItems" JSONB,
  "source" TEXT NOT NULL DEFAULT 'public-web',
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebsiteOrderRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebsiteOrderRequest_status_createdAt_idx"
  ON "WebsiteOrderRequest"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "WebsiteOrderRequest_customerPhone_idx"
  ON "WebsiteOrderRequest"("customerPhone");

CREATE INDEX IF NOT EXISTS "WebsiteOrderRequest_customerId_idx"
  ON "WebsiteOrderRequest"("customerId");

DO $$
BEGIN
  ALTER TABLE "WebsiteOrderRequest"
    ADD CONSTRAINT "WebsiteOrderRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "WebsiteOrderRequest"
    ADD CONSTRAINT "WebsiteOrderRequest_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
