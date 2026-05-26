-- Human-friendly public reference for website order requests (e.g. W-00001).

ALTER TABLE "WebsiteOrderRequest"
  ADD COLUMN IF NOT EXISTS "publicReference" TEXT;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "WebsiteOrderRequest"
  WHERE "publicReference" IS NULL
)
UPDATE "WebsiteOrderRequest" AS w
SET "publicReference" = 'W-' || LPAD(n.rn::text, 5, '0')
FROM numbered AS n
WHERE w."id" = n."id";

ALTER TABLE "WebsiteOrderRequest"
  ALTER COLUMN "publicReference" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "WebsiteOrderRequest_publicReference_key"
  ON "WebsiteOrderRequest"("publicReference");

INSERT INTO "SerialCounter" ("key", "value", "updatedAt")
SELECT
  'WEB_ORDER_REQUEST',
  COALESCE(
    (
      SELECT MAX(CAST(SUBSTRING("publicReference" FROM 3) AS INTEGER))
      FROM "WebsiteOrderRequest"
    ),
    0
  ),
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO UPDATE
SET
  "value" = GREATEST(
    "SerialCounter"."value",
    EXCLUDED."value"
  ),
  "updatedAt" = CURRENT_TIMESTAMP;
