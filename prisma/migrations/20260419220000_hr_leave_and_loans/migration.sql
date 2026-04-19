-- Stage-D (2/2) — LeaveRequest + EmployeeLoan tables with enums.

-- 1. Enums --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveType') THEN
    CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveStatus') THEN
    CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoanStatus') THEN
    CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'SETTLED', 'REJECTED');
  END IF;
END $$;

-- 2. LeaveRequest -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID NOT NULL,
  "type"           "LeaveType" NOT NULL,
  "startDate"      DATE NOT NULL,
  "endDate"        DATE NOT NULL,
  "daysCount"      INTEGER NOT NULL,
  "reason"         TEXT,
  "status"         "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"   UUID,
  "approvedAt"     TIMESTAMP(3),
  "rejectedReason" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeaveRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeaveRequest_userId_startDate_idx"
  ON "LeaveRequest"("userId", "startDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_status_idx"
  ON "LeaveRequest"("status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_startDate_idx"
  ON "LeaveRequest"("startDate");

-- 3. EmployeeLoan -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "EmployeeLoan" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"           UUID NOT NULL,
  "amount"           DECIMAL(19,4) NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "monthlyDeduction" DECIMAL(19,4) NOT NULL,
  "remaining"        DECIMAL(19,4) NOT NULL,
  "reason"           TEXT,
  "status"           "LoanStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"     UUID,
  "approvedAt"       TIMESTAMP(3),
  "rejectedReason"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeLoan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeLoan_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmployeeLoan_userId_idx"
  ON "EmployeeLoan"("userId");
CREATE INDEX IF NOT EXISTS "EmployeeLoan_status_idx"
  ON "EmployeeLoan"("status");
