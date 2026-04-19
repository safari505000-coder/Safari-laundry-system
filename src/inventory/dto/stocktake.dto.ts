import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One line of a physical stocktake submission. */
export class StocktakeLineDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty({ description: 'Counted physical quantity on hand (absolute, never negative).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  countedQuantity!: number;

  @ApiPropertyOptional({ description: 'Optional per-line remark (e.g. "bottle leaked").' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/**
 * Records a physical stocktake for one branch. The service computes, per
 * line, the difference between `countedQuantity` and the system's current
 * `BranchStockLevel.quantityOnHand`, then emits one `StockMovement(ADJUSTMENT)`
 * for every non-zero delta, tagged with the stocktake `reference` so all
 * adjustments from the same count can be reconciled together. Zero-delta
 * lines are ignored.
 */
export class StocktakeDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({
    description: 'Human label / sheet number for this count (e.g. "Q1-2026 physical").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ type: [StocktakeLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  lines!: StocktakeLineDto[];
}
