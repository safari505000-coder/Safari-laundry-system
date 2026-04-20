import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceivePurchaseOrderLineDto {
  @ApiProperty({ description: 'PurchaseOrderLine.id to receive against' })
  @IsUUID()
  purchaseOrderLineId!: string;

  @ApiProperty({ description: 'Quantity received in this delivery (positive)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantityReceived!: number;

  /**
   * When omitted the PO line's `unitCost` is used. Supplying an override
   * lets the receiver correct for supplier adjustments that happened
   * between order and delivery without mutating the original PO.
   */
  @ApiPropertyOptional({
    description:
      'Override unit cost for this receipt line (defaults to PO line unit cost)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;
}

/**
 * Record a physical delivery against an open PurchaseOrder.
 * - All quantities must be > 0.
 * - Sum-to-date per PO line may NOT exceed quantityOrdered.
 * - Each line generates one StockMovement(STOCK_IN) row via
 *   InventoryService.stockIn(…), which also updates the branch
 *   weighted-average cost.
 */
export class ReceivePurchaseOrderDto {
  @ApiProperty({ type: () => [ReceivePurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
