import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';

function trimOpt(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length ? t : undefined;
}

export class PosCreateCustomerDto {
  @ApiProperty({ example: '51234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  phone: string;

  @ApiPropertyOptional({ example: '59990000' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsKuwaitCustomerPhone()
  phone2?: string;

  @ApiProperty({ example: 'محمد أحمد', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName: string;

  @ApiPropertyOptional({ example: 'السالمية' })
  @Transform(trimOpt)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressArea?: string;

  @ApiPropertyOptional({ example: '3' })
  @Transform(trimOpt)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressBlock?: string;

  @ApiPropertyOptional({ example: 'شارع الخليج', default: '' })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  })
  @IsString()
  @MaxLength(200)
  addressStreet = '';

  @ApiPropertyOptional({ example: 'جادة 5' })
  @Transform(trimOpt)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressAvenue?: string;

  @ApiPropertyOptional({ example: 'منزل 12' })
  @Transform(trimOpt)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressHouse?: string;
}
