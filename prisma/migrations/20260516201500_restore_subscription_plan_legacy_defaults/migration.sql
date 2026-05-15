-- Keep fresh databases compatible while legacy SubscriptionPlan columns
-- still exist outside the current Prisma model.
-- `price` and `creditAmount` were superseded by `salePrice` and
-- `actualBalance`, but historical migrations left them NOT NULL.

ALTER TABLE "SubscriptionPlan"
  ALTER COLUMN "price" SET DEFAULT 0;

ALTER TABLE "SubscriptionPlan"
  ALTER COLUMN "creditAmount" SET DEFAULT 0;

