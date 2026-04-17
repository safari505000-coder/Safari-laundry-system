import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDepositStatusDto {
  @ApiProperty({ enum: DepositStatus })
  @IsEnum(DepositStatus)
  status!: DepositStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  auditComment?: string;
}

