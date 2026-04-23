import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({
    description:
      'Employee receiving the loan. Approvers pick any employee; staff may request on own behalf (ignored — set automatically).',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ description: 'Loan principal (KD).' })
  @IsNumber()
  @Min(0.001)
  amount!: number;

  /**
   * V19.20 — the Owner asked for a fixed 1..12 month schedule
   * ("يختار جدول الاقساط من شهر الي 12 شهر"). The UI surfaces this
   * as a dropdown; we clamp server-side so a crafted request can't
   * spread the loan over an absurd horizon.
   */
  @ApiProperty({
    description: 'Number of monthly installments (1..12).',
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  installmentCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RejectLoanDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
