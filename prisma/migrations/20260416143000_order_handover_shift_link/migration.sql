-- Link settled CASH orders to the shift that manager handed over.
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "handoverShiftId" UUID;

CREATE INDEX IF NOT EXISTS "Order_handoverShiftId_idx"
ON "Order"("handoverShiftId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_handoverShiftId_fkey"
FOREIGN KEY ("handoverShiftId")
REFERENCES "Shift"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
