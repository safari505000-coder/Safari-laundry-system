import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * V19.19 — manual loan deduction. The OWNER / GENERAL_MANAGER posts
 * this when they physically collect a loan instalment from the employee
 * (outside the payroll cycle). We record the amount, clamp it to the
 * current `remaining`, and — if it settles the loan — auto-flip status
 * to SETTLED.
 *
 * This deliberately replaces the old auto-deduction-inside-payroll flow
 * so the same loan can never be taken twice from the same month's net.
 */
export class DeductLoanDto {
  @ApiProperty({ description: 'Amount to deduct now (KD).' })
  @IsNumber()
  @Min(0.001)
  amount!: number;

  @ApiPropertyOptional({
    description:
      'Optional note — e.g. cash handover reference, date, or payment method.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
