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
  IsUUID,
  IsPositive,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';
import { OrderLineItemDto } from './order-line-item.dto';

/** Back-office / manager create — full detail, optional driver assignment. */
export class CreateOrderDto {
  @ApiProperty({ example: '+96551234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  customerPhone: string;

  @ApiPropertyOptional({
    example: 'Dubai Marina, Tower A',
    description: 'Optional if not yet known',
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

  @ApiProperty({
    example: 249.5,
    description:
      'Declared total — must be > 0; if lineItems sent, must equal Σ(qty×unitPrice)',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  totalPrice: number;

  @ApiPropertyOptional({
    example: 'INV-2026-1001',
    description: 'Paper invoice reference when available',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'If set, must be a user with DRIVER role',
  })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({
    type: [OrderLineItemDto],
    description:
      'Optional; when provided, totals are reconciled against totalPrice before save',
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
