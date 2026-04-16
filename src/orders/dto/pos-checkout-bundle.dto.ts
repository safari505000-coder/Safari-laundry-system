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
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';
import { OrderLineItemDto } from './order-line-item.dto';

export class PosCheckoutBundlePartDto {
  @ApiProperty({ example: 12.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  totalPrice: number;

  @ApiPropertyOptional({ type: [OrderLineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineItemDto)
  lineItems?: OrderLineItemDto[];
}

/** Multi-invoice POS: one hosted payment for several orders (driver POS). */
export class PosCheckoutBundleDto {
  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  customerPhone: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerDisplayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @ApiPropertyOptional({ enum: ServiceType, enumName: 'ServiceType' })
  @IsOptional()
  @IsEnum(ServiceType, {
    message: 'serviceType must be EXPRESS or NORMAL',
  })
  serviceType?: ServiceType;

  @ApiProperty({
    type: [PosCheckoutBundlePartDto],
    minItems: 2,
    description: 'Each sub-order total (incl. delivery allocation); one gateway charge for the sum',
  })
  @IsArray()
  @ArrayMinSize(2, { message: 'At least two sub-orders are required for bundle checkout' })
  @ValidateNested({ each: true })
  @Type(() => PosCheckoutBundlePartDto)
  orders: PosCheckoutBundlePartDto[];
}
