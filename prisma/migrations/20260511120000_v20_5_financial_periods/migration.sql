-- V20.5 — Phase 5 Monthly Financial Closing.
--
-- A FinancialPeriod row defines the close state of one (year,
-- month) tuple. When CLOSED, the application-layer guard
-- (`PeriodLockGuard`) blocks any new financial mutation whose
-- effective date falls inside the period; only reversal entries
-- are allowed (with explicit operator opt-in).
--
-- The lock is enforced in the application layer because the
-- "effective date" of a journal entry is JournalEntry.createdAt
-- (the ledger is append-only — backdating a single entry is not
-- supported, but reversal entries with their own NEW createdAt
-- are how corrections happen).
--
-- A FinancialPeriodViolation row is appended every time a writer
-- attempts a forbidden write inside a closed period. Append-only
-- — DB triggers block UPDATE/DELETE.

CREATE TYPE "FinancialPeriodStatus" AS ENUM (
  'OPEN',
  'CLOSED'
);

CREATE TABLE "FinancialPeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "FinancialPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "lockedAt" TIMESTAMP(3),
  "lockedById" UUID,
  "lockNotes" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedById" UUID,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialPeriod_year_month_key"
  ON "FinancialPeriod"("year", "month");
CREATE INDEX "FinancialPeriod_status_idx"
  ON "FinancialPeriod"("status");

ALTER TABLE "FinancialPeriod"
  ADD CONSTRAINT "FinancialPeriod_lockedById_fkey"
  FOREIGN KEY ("lockedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialPeriod"
  ADD CONSTRAINT "FinancialPeriod_reopenedById_fkey"
  FOREIGN KEY ("reopenedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FinancialPeriodViolation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "periodId" UUID NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" UUID,
  "writerName" TEXT NOT NULL,
  "sourceRef" TEXT,
  "payload" JSONB,
  CONSTRAINT "FinancialPeriodViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialPeriodViolation_periodId_attemptedAt_idx"
  ON "FinancialPeriodViolation"("periodId", "attemptedAt");
CREATE INDEX "FinancialPeriodViolation_writerName_idx"
  ON "FinancialPeriodViolation"("writerName");

ALTER TABLE "FinancialPeriodViolation"
  ADD CONSTRAINT "FinancialPeriodViolation_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "FinancialPeriod"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialPeriodViolation"
  ADD CONSTRAINT "FinancialPeriodViolation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "FinancialPeriodViolation_append_only_guard"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'FinancialPeriodViolation rows are append-only — % not allowed',
    TG_OP
    USING ERRCODE = '42809';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "FinancialPeriodViolation_no_update" ON "FinancialPeriodViolation";
CREATE TRIGGER "FinancialPeriodViolation_no_update"
BEFORE UPDATE ON "FinancialPeriodViolation"
FOR EACH ROW EXECUTE FUNCTION "FinancialPeriodViolation_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialPeriodViolation_no_delete" ON "FinancialPeriodViolation";
CREATE TRIGGER "FinancialPeriodViolation_no_delete"
BEFORE DELETE ON "FinancialPeriodViolation"
FOR EACH ROW EXECUTE FUNCTION "FinancialPeriodViolation_append_only_guard"();

DROP TRIGGER IF EXISTS "FinancialPeriodViolation_no_truncate" ON "FinancialPeriodViolation";
CREATE TRIGGER "FinancialPeriodViolation_no_truncate"
BEFORE TRUNCATE ON "FinancialPeriodViolation"
FOR EACH STATEMENT EXECUTE FUNCTION "FinancialPeriodViolation_append_only_guard"();
