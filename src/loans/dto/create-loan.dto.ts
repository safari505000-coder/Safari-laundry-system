import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiProperty({ description: 'Number of monthly installments.' })
  @IsInt()
  @Min(1)
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
