import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';

function trimOrUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  return value.trim();
}

/**
 * تعديل بيانات العميل — اسم العرض والهواتف وعناصر العنوان وجهات الاتصال العائلية كلها اختيارية.
 * Update-customer DTO — display name, phones, address fields, and family contacts are all optional patches.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(trimOrUndefined)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  phone2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimOrUndefined)
  addressArea?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimOrUndefined)
  addressBlock?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimOrUndefined)
  addressStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimOrUndefined)
  addressAvenue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimOrUndefined)
  addressHouse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimOrUndefined)
  motherContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimOrUndefined)
  wifeContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimOrUndefined)
  sonContact?: string;
}
