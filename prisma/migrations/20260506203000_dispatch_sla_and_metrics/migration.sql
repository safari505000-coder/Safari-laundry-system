-- Additive SLA + metrics for dispatch monitoring (no data loss).

ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "firstAlertAt" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "breachedAt" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "ackMinutes" INTEGER;
ALTER TABLE "Dispatch" ADD COLUMN IF NOT EXISTS "totalMinutes" INTEGER;

CREATE INDEX IF NOT EXISTS "Dispatch_driverId_status_idx" ON "Dispatch" ("driverId", "status");

CREATE TABLE IF NOT EXISTS "DriverMetrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driverId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "assignedCount" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "breachedCount" INTEGER NOT NULL DEFAULT 0,
    "avgAckMinutes" DOUBLE PRECISION,
    "avgTotalMinutes" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverMetrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverMetrics_driverId_date_key" ON "DriverMetrics"("driverId", "date");

CREATE INDEX IF NOT EXISTS "DriverMetrics_driverId_idx" ON "DriverMetrics"("driverId");

ALTER TABLE "DriverMetrics" ADD CONSTRAINT "DriverMetrics_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
