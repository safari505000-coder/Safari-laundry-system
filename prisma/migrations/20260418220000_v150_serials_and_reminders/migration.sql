-- Dastur V1.5 — Serials, 24h reminder guard, and Call Center renewal hooks.
-- Backward compatible: every new column is optional or has a default.

-- 1. User: Owner-assigned driver prefix (unique, nullable).
ALTER TABLE "User"
  ADD COLUMN "driverPrefix" TEXT;

CREATE UNIQUE INDEX "User_driverPrefix_key" ON "User"("driverPrefix");

-- 2. Order: human-readable serial + reminder counter + 24h-guard timestamp.
ALTER TABLE "Order"
  ADD COLUMN "serialNumber"   TEXT,
  ADD COLUMN "reminderCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_serialNumber_key" ON "Order"("serialNumber");
CREATE INDEX "Order_serialNumber_idx" ON "Order"("serialNumber");

-- 3. CustomerWallet: subscription-side reminder counter + guard timestamp.
ALTER TABLE "CustomerWallet"
  ADD COLUMN "subscriptionReminderCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "subscriptionLastReminderAt" TIMESTAMP(3);

-- 4. Global atomic counter (e.g. ORDER_SERIAL).
CREATE TABLE "SerialCounter" (
  "key"       TEXT NOT NULL,
  "value"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SerialCounter_pkey" PRIMARY KEY ("key")
);

-- Seed the order-serial counter at 0 so the first increment returns 1.
-- `updatedAt` must be provided explicitly because Prisma `@updatedAt`
-- is application-side. Using NOW() at seed time is fine — every
-- subsequent increment will refresh it via Prisma.
INSERT INTO "SerialCounter" ("key", "value", "updatedAt")
VALUES ('ORDER_SERIAL', 0, NOW())
ON CONFLICT ("key") DO NOTHING;
