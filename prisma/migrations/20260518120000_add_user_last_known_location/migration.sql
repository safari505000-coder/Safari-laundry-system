-- Last GPS point snapshot on User (e.g. "lat,lng" string).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastKnownLocation" TEXT;
