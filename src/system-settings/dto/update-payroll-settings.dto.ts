import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/**
 * V19.17 — DTO for the Owner "Payroll settings" card on the Settings
 * Dashboard. See `PayrollSettings` model for the field semantics.
 */
export class UpdatePayrollSettingsDto {
  /**
   * Day of month the Owner normally cuts payroll. Clamped to [1,28]
   * to avoid month-end drift (February has 28 days).
   */
  @IsInt()
  @Min(1)
  @Max(28)
  payDayOfMonth!: number;

  @IsBoolean()
  autoDeductLoans!: boolean;

  @IsBoolean()
  linkWithAttendance!: boolean;
}
