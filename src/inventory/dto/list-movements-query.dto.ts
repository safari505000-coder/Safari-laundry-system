import { ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Filter payload for the movements audit screen. All params optional; the
 * service combines them with an AND so `type=STOCK_OUT&branchId=X` returns
 * only branch X's consumption entries.
 */
export class ListMovementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stockItemId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ description: 'Inclusive ISO date (YYYY-MM-DD) lower bound.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO date (YYYY-MM-DD) upper bound.' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
