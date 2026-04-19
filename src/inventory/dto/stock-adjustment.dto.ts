import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Free-form adjustment for breakage, expiry, theft, or physical stocktake
 * correction. The `delta` is signed — negative to reduce, positive to
 * increase — and applied directly to `BranchStockLevel.quantityOnHand`. The
 * adjustment is recorded as a single `StockMovement(ADJUSTMENT)` row with
 * the signed delta, preserving a full audit trail.
 */
export class StockAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    description: 'Signed quantity delta. Negative = reduce stock, positive = increase.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  delta!: number;

  @ApiProperty({ description: 'Mandatory human reason (e.g. "breakage", "expired", "count correction").' })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
