-- V19.4 — CC pack #2 / #11 / #12.
-- Introduces a per-instance subscription ledger ("CustomerSubscription")
-- alongside the existing per-customer `CustomerWallet` snapshot. Adds
-- optional FK columns on `Order` and `TransactionHistory` so future
-- activity can be grouped by subscription. Backfills one row per
-- currently-active wallet so the first rollover after this deploy has
-- a valid predecessor to attach to (option 3-A).

-- 1. New enum ---------------------------------------------------------
CREATE TYPE "CustomerSubscriptionStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'ROLLED_OVER',
  'CUT_OFF',
  'CANCELLED'
);

-- 2. New table --------------------------------------------------------
CREATE TABLE "CustomerSubscription" (
  "id"                        UUID                         NOT NULL,
  "customerId"                UUID                         NOT NULL,
  "planId"                    UUID,
  "status"                    "CustomerSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "planNameSnapshot"          TEXT                         NOT NULL,
  "planSalePriceSnapshot"     DECIMAL(19,4)                NOT NULL,
  "planActualBalanceSnapshot" DECIMAL(19,4)                NOT NULL,
  "planValidityDaysSnapshot"  INTEGER                      NOT NULL,
  "carriedBalanceKd"          DECIMAL(19,4)                NOT NULL DEFAULT 0,
  "parentSubscriptionId"      UUID,
  "activatedAt"               TIMESTAMP(3)                 NOT NULL,
  "expiresAt"                 TIMESTAMP(3)                 NOT NULL,
  "closedAt"                  TIMESTAMP(3),
  "closedReason"              TEXT,
  "createdAt"                 TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3)                 NOT NULL,

  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSubscription_parentSubscriptionId_key"
  ON "CustomerSubscription"("parentSubscriptionId");

CREATE INDEX "CustomerSubscription_customerId_createdAt_idx"
  ON "CustomerSubscription"("customerId", "createdAt");

CREATE INDEX "CustomerSubscription_customerId_status_idx"
  ON "CustomerSubscription"("customerId", "status");

CREATE INDEX "CustomerSubscription_expiresAt_idx"
  ON "CustomerSubscription"("expiresAt");

ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerSubscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerSubscription_parentSubscriptionId_fkey"
    FOREIGN KEY ("parentSubscriptionId") REFERENCES "CustomerSubscription"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. FK columns on Order and TransactionHistory ----------------------
ALTER TABLE "Order"              ADD COLUMN "subscriptionId" UUID;
ALTER TABLE "TransactionHistory" ADD COLUMN "subscriptionId" UUID;

CREATE INDEX "Order_subscriptionId_idx"              ON "Order"("subscriptionId");
CREATE INDEX "TransactionHistory_subscriptionId_idx" ON "TransactionHistory"("subscriptionId");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TransactionHistory"
  ADD CONSTRAINT "TransactionHistory_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Backfill --------------------------------------------------------
-- Option 3-A: one CustomerSubscription row per currently-known wallet
-- activation (i.e. wallets that have a non-null subscriptionActivatedAt
-- AND a non-null subscriptionExpiresAt). Plan snapshot is derived from
-- the plan catalogue when the wallet still carries a plan id; when the
-- plan was soft-deleted we fall back to the wallet's cached name and
-- zero-value amounts (the chain still needs a predecessor so the next
-- rollover can attach, even if the numbers are stale).
INSERT INTO "CustomerSubscription" (
  "id",
  "customerId",
  "planId",
  "status",
  "planNameSnapshot",
  "planSalePriceSnapshot",
  "planActualBalanceSnapshot",
  "planValidityDaysSnapshot",
  "carriedBalanceKd",
  "activatedAt",
  "expiresAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  w."customerId",
  w."subscriptionPlanId",
  CASE
    WHEN w."subscriptionExpiresAt" > NOW() THEN 'ACTIVE'::"CustomerSubscriptionStatus"
    ELSE 'EXPIRED'::"CustomerSubscriptionStatus"
  END,
  COALESCE(p."name", w."subscriptionPlanName", 'Unknown plan'),
  COALESCE(p."salePrice",     0),
  COALESCE(p."actualBalance", 0),
  COALESCE(p."validityDays",  30),
  0,                                 -- first chain row, nothing carried
  w."subscriptionActivatedAt",
  w."subscriptionExpiresAt",
  w."subscriptionActivatedAt",
  NOW()
FROM "CustomerWallet" w
LEFT JOIN "SubscriptionPlan" p ON p."id" = w."subscriptionPlanId"
WHERE w."subscriptionActivatedAt" IS NOT NULL
  AND w."subscriptionExpiresAt"   IS NOT NULL;
