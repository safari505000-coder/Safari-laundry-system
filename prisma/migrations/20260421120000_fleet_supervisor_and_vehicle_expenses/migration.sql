-- V19.10 — Fleet Supervisor (مسؤول السيارات) + VehicleExpense workflow.
--
-- Adds:
--   1. FLEET_SUPERVISOR rank on SafariRole enum.
--   2. VehicleExpenseStatus (PENDING_ACCOUNTANT/APPROVED/REJECTED).
--   3. VehicleExpenseType (fuel, oil, tires, repairs, admin, ...).
--   4. VehicleExpense table with FK's to User (submitter + reviewer),
--      mandatory receipt TEXT column, and indices for the three hot
--      query paths: status queue, date range reports, and per-plate
--      history.
-- Idempotent: `IF NOT EXISTS` everywhere so re-running the migration
-- on a DB that already has it is a no-op.

ALTER TYPE "SafariRole" ADD VALUE IF NOT EXISTS 'FLEET_SUPERVISOR' AFTER 'CALL_CENTER_SUPERVISOR';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleExpenseStatus') THEN
    CREATE TYPE "VehicleExpenseStatus" AS ENUM (
      'PENDING_ACCOUNTANT',
      'APPROVED',
      'REJECTED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleExpenseType') THEN
    CREATE TYPE "VehicleExpenseType" AS ENUM (
      'FUEL',
      'OIL_CHANGE',
      'TIRES',
      'MECHANICAL_REPAIR',
      'ELECTRICAL_REPAIR',
      'BODY_REPAIR',
      'AC_REPAIR',
      'WASHING',
      'REGISTRATION',
      'INSURANCE',
      'SPARE_PARTS',
      'OTHER'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "VehicleExpense" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehiclePlate"    VARCHAR(32)  NOT NULL,
  "vehicleLabel"    VARCHAR(120),
  "expenseType"     "VehicleExpenseType"   NOT NULL,
  "amount"          DECIMAL(19, 4) NOT NULL,
  "odometerKm"      INTEGER,
  "vendorName"      VARCHAR(160),
  "description"     TEXT,
  "status"          "VehicleExpenseStatus" NOT NULL DEFAULT 'PENDING_ACCOUNTANT',
  "receiptUrl"      TEXT NOT NULL,
  "submittedById"   UUID NOT NULL,
  "reviewedById"    UUID,
  "reviewedAt"      TIMESTAMP(3),
  "rejectionReason" TEXT,
  "expenseDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleExpense_submittedBy_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleExpense_reviewedBy_fkey"  FOREIGN KEY ("reviewedById")  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "VehicleExpense_status_idx"       ON "VehicleExpense"("status");
CREATE INDEX IF NOT EXISTS "VehicleExpense_expenseDate_idx"  ON "VehicleExpense"("expenseDate");
CREATE INDEX IF NOT EXISTS "VehicleExpense_submittedBy_idx"  ON "VehicleExpense"("submittedById");
CREATE INDEX IF NOT EXISTS "VehicleExpense_vehiclePlate_idx" ON "VehicleExpense"("vehiclePlate");
CREATE INDEX IF NOT EXISTS "VehicleExpense_expenseType_idx"  ON "VehicleExpense"("expenseType");
