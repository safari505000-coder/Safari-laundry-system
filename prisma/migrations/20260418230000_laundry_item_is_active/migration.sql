-- Add soft-hide flag to laundry price list items.
-- Defaults to TRUE so every historical row remains visible in POS/Driver catalogs
-- until the OWNER explicitly hides it from the Manage Price List screen.
ALTER TABLE "LaundryPriceListItem"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX "LaundryPriceListItem_isActive_idx"
  ON "LaundryPriceListItem"("isActive");
