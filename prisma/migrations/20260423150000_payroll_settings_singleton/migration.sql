-- V19.17 — Payroll Settings singleton.
--
-- Adds a `PayrollSettings` singleton row that the Owner tunes from the
-- Settings Dashboard. Orthogonal to the `SystemToggle` master ON/OFF:
-- toggle controls whether payroll is enabled at all; this row controls
-- *how* a payroll run behaves when triggered.
--
-- Safe to apply on a live DB — new table only, seeded with one row so
-- the UI always has a record to edit.

CREATE TABLE IF NOT EXISTS "PayrollSettings" (
    "id"                 TEXT NOT NULL DEFAULT 'singleton',
    "payDayOfMonth"      INTEGER NOT NULL DEFAULT 1,
    "autoDeductLoans"    BOOLEAN NOT NULL DEFAULT true,
    "linkWithAttendance" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so the /settings/dashboard read always
-- succeeds on first load.
INSERT INTO "PayrollSettings" ("id", "payDayOfMonth", "autoDeductLoans", "linkWithAttendance", "updatedAt")
VALUES ('singleton', 1, true, false, NOW())
ON CONFLICT ("id") DO NOTHING;
