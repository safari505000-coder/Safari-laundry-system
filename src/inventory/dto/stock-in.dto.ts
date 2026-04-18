import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Accountant-only payload — record a purchase/receipt of stock. Creates a
 * `StockMovement(STOCK_IN)` row, increments `BranchStockLevel.quantityOnHand`,
 * and updates the weighted-moving-average `avgUnitCost` on that level.
 */
export class StockInDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Quantity received (positive units)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: 'Per-unit purchase cost in KD' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({
    description: 'Existing supplier ID (preferred) or leave blank + supplierName.',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Free-text supplier name; auto-creates a Supplier row if supplierId absent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @ApiPropertyOptional({ description: 'External ref (invoice / PO number).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: 'Base64 / URL receipt pointer (≤ 1 MB per Dastur).',
  })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
