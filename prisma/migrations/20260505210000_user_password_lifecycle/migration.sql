-- V19.x — forced password change lifecycle (admin reset + first-login gate).
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "passwordUpdatedAt" TIMESTAMP(3);
