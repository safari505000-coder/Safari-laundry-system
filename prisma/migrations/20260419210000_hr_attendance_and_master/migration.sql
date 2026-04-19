-- Stage-D (1/N) — HR master-data on User + AttendanceLog table.
-- Adds HR fields so payroll can auto-seed from User records, and
-- introduces a daily attendance row per (user, logical Kuwait date).

-- 1. Enum ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceSource') THEN
    CREATE TYPE "AttendanceSource" AS ENUM (
      'SHIFT_AUTO',
      'BIOMETRIC',
      'MANUAL'
    );
  END IF;
END $$;

-- 2. User HR master-data columns -----------------------------------------
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "civilId"             TEXT,
  ADD COLUMN IF NOT EXISTS "nationality"         TEXT,
  ADD COLUMN IF NOT EXISTS "address"             TEXT,
  ADD COLUMN IF NOT EXISTS "bankName"            TEXT,
  ADD COLUMN IF NOT EXISTS "bankIban"            TEXT,
  ADD COLUMN IF NOT EXISTS "hireDate"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "basicMonthlySalary"  DECIMAL(19,4),
  ADD COLUMN IF NOT EXISTS "monthlyAllowances"   DECIMAL(19,4);

-- Unique index on civilId (nullable uniqueness: only enforced when set).
CREATE UNIQUE INDEX IF NOT EXISTS "User_civilId_key"
  ON "User"("civilId")
  WHERE "civilId" IS NOT NULL;

-- 3. AttendanceLog -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "AttendanceLog" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      UUID NOT NULL,
  "branchId"    UUID,
  "date"        DATE NOT NULL,
  "checkInAt"   TIMESTAMP(3),
  "checkOutAt"  TIMESTAMP(3),
  "source"      "AttendanceSource" NOT NULL DEFAULT 'SHIFT_AUTO',
  "externalRef" TEXT,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AttendanceLog_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceLog_userId_date_key"
  ON "AttendanceLog"("userId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceLog_date_idx"
  ON "AttendanceLog"("date");
CREATE INDEX IF NOT EXISTS "AttendanceLog_branchId_date_idx"
  ON "AttendanceLog"("branchId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceLog_source_idx"
  ON "AttendanceLog"("source");
