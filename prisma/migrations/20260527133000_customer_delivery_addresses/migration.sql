-- Persist customer mobile delivery addresses server-side.
CREATE TABLE "CustomerDeliveryAddress" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "label" TEXT,
  "address" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerDeliveryAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerDeliveryAddress_customerId_idx" ON "CustomerDeliveryAddress"("customerId");
CREATE INDEX "CustomerDeliveryAddress_isDefault_idx" ON "CustomerDeliveryAddress"("isDefault");

ALTER TABLE "CustomerDeliveryAddress"
  ADD CONSTRAINT "CustomerDeliveryAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
