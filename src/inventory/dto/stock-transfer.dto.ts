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
 * Moves stock between two branches atomically. One database transaction
 * writes two `StockMovement` rows (TRANSFER_OUT and TRANSFER_IN) sharing the
 * same generated `reference` so they can be paired in the audit view, and
 * updates both `BranchStockLevel` rows. The destination branch inherits the
 * source's `avgUnitCost` weighted into its current balance.
 */
export class StockTransferDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty({ description: 'Source branch (stock leaves here).' })
  @IsUUID()
  fromBranchId!: string;

  @ApiProperty({ description: 'Destination branch (stock arrives here).' })
  @IsUUID()
  toBranchId!: string;

  @ApiProperty({ description: 'Quantity to move (positive number).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiPropertyOptional()
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
