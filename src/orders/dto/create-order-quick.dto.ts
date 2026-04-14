import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';
import { OrderLineItemDto } from './order-line-item.dto';

/** Minimal payload for drivers creating an order in the field (mobile-first). */
export class CreateOrderQuickDto {
  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  customerPhone: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'When set, order is attached to this customer (phone must match customerPhone)',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Saved on customer when creating or updating',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerDisplayName?: string;

  @ApiProperty({
    example: 120.5,
    description:
      'Declared order total — must be > 0; if lineItems sent, must equal their sum',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  totalPrice: number;

  @ApiPropertyOptional({
    example: 'INV-2026-88421',
    description: 'Optional until the paper invoice is available',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'Customer asked for call before delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Skip on mobile if unknown; can be updated later',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @ApiPropertyOptional({
    enum: ServiceType,
    enumName: 'ServiceType',
    description: 'Must be EXPRESS or NORMAL when supplied; defaults to NORMAL',
  })
  @IsOptional()
  @IsEnum(ServiceType, {
    message: 'serviceType must be EXPRESS or NORMAL',
  })
  serviceType?: ServiceType;

  @ApiPropertyOptional({
    type: [OrderLineItemDto],
    description:
      'Optional line items; when present, Σ(qty×unitPrice) must match totalPrice (safety check)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'When lineItems is provided, at least one line is required',
  })
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems?: OrderLineItemDto[];
}
