-- Optional vehicle display label on User (tracking UI; e.g. Toyota LC300).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vehicleLabel" TEXT;
