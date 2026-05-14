-- V19.16 — Commission, Debt-Hold & System Toggles
-- -------------------------------------------------
-- Adds Owner-configurable commission rules + a dedicated CommissionPayout
-- ledger, per-employee DebtHold slips (withheld from net pay but tracked
-- separately from `Payroll.deductions`), and a master SystemToggle
-- registry. Extends `Payroll` with three purely-informational decimal
-- columns (`commissionAmount`, `debtHoldAmount`, `debtReleaseAmount`) so
-- the payslip can surface each band without folding them into the
-- historical `allowances` / `deductions` totals.
--
-- All additions are non-destructive:
--   • new enums / tables are guarded with IF NOT EXISTS
--   • Payroll column adds use IF NOT EXISTS with DEFAULT 0
--   • no existing row is rewritten
-- so this migration is safe to replay.

-- ─── Enums ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('PENDING', 'PAID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionMode" AS ENUM ('SALE', 'COLLECTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionCalculationBase" AS ENUM (
    'ORDER_TOTAL',
    'INVOICE_TOTAL',
    'NET_AFTER_KNET',
    'EXCLUDE_SUBSCRIPTIONS'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionPayoutTiming" AS ENUM (
    'IMMEDIATE',
    'AFTER_COLLECTION',
    'END_OF_MONTH'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionPayoutStatus" AS ENUM (
    'PENDING',
    'RELEASED',
    'PAID',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DebtHoldStatus" AS ENUM ('HELD', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DebtHoldMode" AS ENUM ('FULL', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SystemToggleKey" AS ENUM (
    'COMMISSION',
    'DEBT_HOLD',
    'PAYROLL',
    'LOANS',
    'ATTENDANCE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Payroll base table ──────────────────────────────────────────────
-- Some fresh databases reach this migration without an earlier Payroll
-- table creation migration. Create the canonical table before adding
-- commission/debt-hold columns and FKs that reference it.
CREATE TABLE IF NOT EXISTS "Payroll" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      UUID NOT NULL,
  "branchId"    UUID NOT NULL,
  "basicSalary" DECIMAL(19, 4) NOT NULL,
  "allowances"  DECIMAL(19, 4) NOT NULL DEFAULT 0,
  "deductions"  DECIMAL(19, 4) NOT NULL DEFAULT 0,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "status"      "PayrollStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payroll_userId_fkey'
  ) THEN
    ALTER TABLE "Payroll"
      ADD CONSTRAINT "Payroll_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payroll_branchId_fkey'
  ) THEN
    ALTER TABLE "Payroll"
      ADD CONSTRAINT "Payroll_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Payroll_branchId_paymentDate_idx"
  ON "Payroll" ("branchId", "paymentDate");
CREATE INDEX IF NOT EXISTS "Payroll_userId_paymentDate_idx"
  ON "Payroll" ("userId", "paymentDate");
CREATE INDEX IF NOT EXISTS "Payroll_status_idx"
  ON "Payroll" ("status");

-- ─── Payroll additive columns ────────────────────────────────────────
ALTER TABLE "Payroll"
  ADD COLUMN IF NOT EXISTS "commissionAmount"   DECIMAL(19, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "debtHoldAmount"     DECIMAL(19, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "debtReleaseAmount"  DECIMAL(19, 4) NOT NULL DEFAULT 0;

-- ─── CommissionRule ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CommissionRule" (
  "id"               UUID PRIMARY KEY,
  "name"             TEXT                        NOT NULL,
  "isActive"         BOOLEAN                     NOT NULL DEFAULT true,
  "role"             "SafariRole",
  "mode"             "CommissionMode"            NOT NULL,
  "calculationBase"  "CommissionCalculationBase" NOT NULL DEFAULT 'ORDER_TOTAL',
  "percentage"       DECIMAL(7, 4)               NOT NULL,
  "minInvoiceAmount" DECIMAL(19, 4)              NOT NULL DEFAULT 0,
  "payoutTiming"     "CommissionPayoutTiming"    NOT NULL DEFAULT 'IMMEDIATE',
  "linkedToDebt"     BOOLEAN                     NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)                NOT NULL
);

CREATE INDEX IF NOT EXISTS "CommissionRule_isActive_role_idx"
  ON "CommissionRule" ("isActive", "role");
CREATE INDEX IF NOT EXISTS "CommissionRule_mode_idx"
  ON "CommissionRule" ("mode");

-- ─── CommissionPayout ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CommissionPayout" (
  "id"                UUID PRIMARY KEY,
  "ruleId"            UUID                     NOT NULL,
  "earnerUserId"      UUID                     NOT NULL,
  "mode"              "CommissionMode"         NOT NULL,
  "basisAmount"       DECIMAL(19, 4)           NOT NULL,
  "percentage"        DECIMAL(7, 4)            NOT NULL,
  "amount"            DECIMAL(19, 4)           NOT NULL,
  "status"            "CommissionPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "sourceOrderId"     UUID,
  "sourceDebtEntryId" UUID,
  "payrollId"         UUID,
  "earnedAt"          TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt"        TIMESTAMP(3),
  "paidAt"            TIMESTAMP(3),
  "cancelledAt"       TIMESTAMP(3),
  "cancelReason"      TEXT,
  "createdAt"         TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)             NOT NULL,
  CONSTRAINT "CommissionPayout_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "CommissionRule" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionPayout_earnerUserId_fkey"
    FOREIGN KEY ("earnerUserId") REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommissionPayout_sourceOrderId_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "Order" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommissionPayout_sourceDebtEntryId_fkey"
    FOREIGN KEY ("sourceDebtEntryId") REFERENCES "DebtLedgerEntry" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommissionPayout_payrollId_fkey"
    FOREIGN KEY ("payrollId") REFERENCES "Payroll" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPayout_per_order_uniq"
  ON "CommissionPayout" ("sourceOrderId", "ruleId", "earnerUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPayout_per_debt_entry_uniq"
  ON "CommissionPayout" ("sourceDebtEntryId", "ruleId", "earnerUserId");
CREATE INDEX IF NOT EXISTS "CommissionPayout_earnerUserId_earnedAt_idx"
  ON "CommissionPayout" ("earnerUserId", "earnedAt");
CREATE INDEX IF NOT EXISTS "CommissionPayout_status_idx"
  ON "CommissionPayout" ("status");
CREATE INDEX IF NOT EXISTS "CommissionPayout_ruleId_idx"
  ON "CommissionPayout" ("ruleId");
CREATE INDEX IF NOT EXISTS "CommissionPayout_payrollId_idx"
  ON "CommissionPayout" ("payrollId");

-- ─── DebtHold ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DebtHold" (
  "id"             UUID PRIMARY KEY,
  "employeeUserId" UUID             NOT NULL,
  "payrollId"      UUID,
  "debtAmount"     DECIMAL(19, 4)   NOT NULL,
  "holdAmount"     DECIMAL(19, 4)   NOT NULL,
  "releasedAmount" DECIMAL(19, 4)   NOT NULL DEFAULT 0,
  "status"         "DebtHoldStatus" NOT NULL DEFAULT 'HELD',
  "releaseDate"    TIMESTAMP(3),
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "DebtHold_employeeUserId_fkey"
    FOREIGN KEY ("employeeUserId") REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DebtHold_payrollId_fkey"
    FOREIGN KEY ("payrollId") REFERENCES "Payroll" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DebtHold_employeeUserId_status_idx"
  ON "DebtHold" ("employeeUserId", "status");
CREATE INDEX IF NOT EXISTS "DebtHold_payrollId_idx"
  ON "DebtHold" ("payrollId");

-- ─── DebtHoldPolicy (singleton) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DebtHoldPolicy" (
  "id"          TEXT PRIMARY KEY DEFAULT 'singleton',
  "isActive"    BOOLEAN          NOT NULL DEFAULT false,
  "holdMode"    "DebtHoldMode"   NOT NULL DEFAULT 'FULL',
  "fixedAmount" DECIMAL(19, 4),
  "updatedAt"   TIMESTAMP(3)     NOT NULL
);

-- Seed the singleton row (inactive by default).
INSERT INTO "DebtHoldPolicy" ("id", "isActive", "holdMode", "fixedAmount", "updatedAt")
VALUES ('singleton', false, 'FULL', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ─── SystemToggle ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SystemToggle" (
  "key"       "SystemToggleKey" PRIMARY KEY,
  "isEnabled" BOOLEAN           NOT NULL DEFAULT true,
  "updatedBy" UUID,
  "updatedAt" TIMESTAMP(3)      NOT NULL
);

-- Seed the five known toggles so Owner UI always has rows to render.
-- COMMISSION + DEBT_HOLD default OFF (opt-in); existing payroll / loans /
-- attendance stay ON for backwards compatibility.
INSERT INTO "SystemToggle" ("key", "isEnabled", "updatedAt") VALUES
  ('COMMISSION', false, CURRENT_TIMESTAMP),
  ('DEBT_HOLD',  false, CURRENT_TIMESTAMP),
  ('PAYROLL',    true,  CURRENT_TIMESTAMP),
  ('LOANS',      true,  CURRENT_TIMESTAMP),
  ('ATTENDANCE', true,  CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
