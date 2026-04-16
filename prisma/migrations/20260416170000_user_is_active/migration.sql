-- Owner user lifecycle control: deactivate account to block login.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
