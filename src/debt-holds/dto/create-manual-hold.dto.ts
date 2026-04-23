import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * V19.17 — DTO for `POST /debt-holds/manual`. Owner/GM-only admin
 * action: withholds `holdAmount` from the employee outside of the
 * automatic open-customer-debt computation (e.g. one-off cash advance
 * the employee agreed to repay next salary).
 */
export class CreateManualHoldDto {
  @IsUUID()
  employeeUserId!: string;

  @IsNumber()
  @Min(0.001)
  holdAmount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  /**
   * V19.17 — if present, ties the hold directly to an existing
   * Payroll row and increments that row's `debtHoldAmount` in one
   * transaction. Used when the Owner stamps a manual hold on an
   * already-saved payslip from the payroll page; without it the hold
   * stays unlinked and is absorbed into the NEXT payroll.
   */
  @IsOptional()
  @IsUUID()
  payrollId?: string;
}
