-- Dastur §7 — POS → Inventory auto-decrement link.
-- Adds an optional `stockItemId` column on OrderLineItem so completed
-- POS orders can emit matching STOCK_OUT movements at the driver's
-- branch. Nullable + ON DELETE SET NULL keeps existing laundry-only
-- line items untouched and unaffected.

ALTER TABLE "OrderLineItem"
  ADD COLUMN "stockItemId" UUID;

ALTER TABLE "OrderLineItem"
  ADD CONSTRAINT "OrderLineItem_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OrderLineItem_stockItemId_idx"
  ON "OrderLineItem"("stockItemId");
