import { ApiPropertyOptional } from '@nestjs/swagger';
import { DebtTransferStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListDebtTransfersDto {
  @ApiPropertyOptional({ enum: DebtTransferStatus })
  @IsOptional()
  @IsEnum(DebtTransferStatus)
  status?: DebtTransferStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sourceDriverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetDriverId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'GM or Accountant who initiated the transfer.',
  })
  @IsOptional()
  @IsUUID()
  executedById?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive).' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date (inclusive).' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
