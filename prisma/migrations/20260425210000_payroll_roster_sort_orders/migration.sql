-- V19.26 — Payroll roster display order (branches + employees).
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "payrollRosterSortOrder" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payrollRosterLineOrder" INTEGER;
