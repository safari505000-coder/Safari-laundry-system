import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * V19.17 — DTO for `PATCH /users/:id/salary-defaults`.
 *
 * Both fields are optional + nullable: omit = no change, null = clear
 * the default, a number = set the value (clamped to ≥ 0).
 */
export class UpdateSalaryDefaultsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  basicMonthlySalary?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAllowances?: number | null;
}
