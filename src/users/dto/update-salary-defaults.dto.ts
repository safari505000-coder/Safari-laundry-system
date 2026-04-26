import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * V19.17 — DTO for `PATCH /users/:id/salary-defaults`.
 *
 * Salary fields: omit = no change, null = clear the default, number = set.
 * HR extras (V19.27): roster order + bank details for مسير / تحويل الراتب.
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

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(1)
  payrollRosterLineOrder?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(120)
  bankName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(42)
  bankIban?: string | null;
}
