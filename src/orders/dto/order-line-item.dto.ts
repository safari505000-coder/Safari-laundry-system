import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StarchOption } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class OrderLineItemDto {
  @ApiPropertyOptional({ example: 'Express crate — Zone A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    enum: StarchOption,
    enumName: 'StarchOption',
    description: 'Optional starch option; STARCH_25 means 25% starch (نشا 25%).',
  })
  @IsOptional()
  @IsEnum(StarchOption)
  starchOption?: StarchOption;

  /** May be 0 for free delivery / zero-priced surcharge rows (e.g. attached-invoice trip fee). */
  @ApiProperty({ example: 45.25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice: number;

  /**
   * Optional inventory SKU link. When present, the completion
   * pipeline emits a STOCK_OUT movement at the driver's branch. Kept
   * optional so laundry-as-service rows pass through with no
   * inventory side-effects.
   */
  @ApiPropertyOptional({
    description:
      'Optional StockItem id; when set, triggers a STOCK_OUT at order completion.',
    example: '9b0a4c77-8cfe-4f8b-90f0-2b4e15a17ad2',
  })
  @IsOptional()
  @IsUUID()
  stockItemId?: string;
}
