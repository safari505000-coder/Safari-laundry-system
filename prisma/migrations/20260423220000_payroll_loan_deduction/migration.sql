-- V19.20 — payroll-booked loan instalments + idempotency guard.
--
-- Payroll re-adds the loan instalment as a dedicated deducted line
-- (`Payroll.loanDeduction`). To make sure re-running the same month's
-- payroll cannot take the same instalment twice, every EmployeeLoan
-- now tracks the last "YYYY-MM" it was deducted for
-- (`EmployeeLoan.lastDeductionYearMonth`). `PayrollService.create`
-- consults this field before booking the next instalment.
--
-- Both columns are nullable-safe for historical rows:
--  * `loanDeduction` defaults to 0 so pre-V19.20 payrolls read as "no
--    loan line".
--  * `lastDeductionYearMonth` is nullable — NULL means the loan has
--    never been consumed by a payroll yet.

ALTER TABLE "EmployeeLoan"
  ADD COLUMN "lastDeductionYearMonth" VARCHAR(7);

ALTER TABLE "Payroll"
  ADD COLUMN "loanDeduction" DECIMAL(19, 4) NOT NULL DEFAULT 0;
