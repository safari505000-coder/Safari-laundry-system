-- Driver acknowledgement lifecycle for dispatch instructions.
ALTER TYPE "DispatchStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "DispatchStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Dispatch"
ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);

