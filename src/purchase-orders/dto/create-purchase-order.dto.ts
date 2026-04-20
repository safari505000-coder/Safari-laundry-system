import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderLineDto {
  @ApiProperty()
  @IsUUID()
  stockItemId!: string;

  @ApiProperty({ description: 'Quantity ordered (positive units)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantityOrdered!: number;

  @ApiProperty({ description: 'Per-unit purchase cost in KD' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost!: number;
}

/**
 * Create a DRAFT PurchaseOrder. The PO can later be sent to the
 * supplier (→ SENT) and then received in one or more deliveries.
 */
export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ description: 'Branch that will receive the goods' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ type: () => [CreatePurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];

  @ApiPropertyOptional({ description: 'Expected delivery ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
