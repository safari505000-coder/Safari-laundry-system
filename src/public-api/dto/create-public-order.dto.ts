import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';

class PublicRequestedItemDto {
  @ApiProperty({ example: 'Dishdasha' })
  @IsString()
  @MaxLength(120)
  label: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreatePublicOrderDto {
  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @IsKuwaitCustomerPhone()
  customerPhone: string;

  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerDisplayName?: string;

  @ApiPropertyOptional({ example: 'Salmiya block 10 street 2 house 5' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @ApiPropertyOptional({ enum: ServiceType, enumName: 'ServiceType' })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({ example: 'Please call before pickup' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [PublicRequestedItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PublicRequestedItemDto)
  requestedItems?: PublicRequestedItemDto[];
}
