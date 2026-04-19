import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Records consumption / usage of stock from a branch (shampoo used during a
 * shift, spare part installed, bag of detergent opened, etc.). Creates a
 * `StockMovement(STOCK_OUT)` row, decrements `BranchStockLevel.quantityOnHand`,
 * and does NOT touch `avgUnitCost` (moving-average is purchase-side only).
 *
 * A positive `quantity` is expected; it is stored as a signed negative number
 * in `StockMovement.quantity` for arithmetic reporting.
 */
export class StockOutDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Quantity consumed (positive number)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional({ description: 'Reason / external ref (e.g. shift id, job).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
