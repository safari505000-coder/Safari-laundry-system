UPDATE "Order"
SET "posPaymentMethod" = 'CASH'
WHERE "posPaymentMethod" IS NULL;

ALTER TABLE "Order"
  ALTER COLUMN "posPaymentMethod" SET DEFAULT 'CASH',
  ALTER COLUMN "posPaymentMethod" SET NOT NULL;
