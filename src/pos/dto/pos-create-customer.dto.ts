import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsKuwaitCustomerPhone } from '../../common/validation/kuwait-customer-phone';

/** Always yields a string (empty when missing) so validation never sees non-strings. */
function toAddressStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function normalizePhone2(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const t = value.replace(/[\s-]/g, '').trim();
  return t.length >= 8 ? t : undefined;
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
  @Transform(({ value }: { value: unknown }) => normalizePhone2(value))
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
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressArea?: string;

  @ApiPropertyOptional({ example: '3' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressBlock?: string;

  @ApiPropertyOptional({ example: 'شارع الخليج' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressStreet?: string;

  @ApiPropertyOptional({ example: 'جادة 5' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressAvenue?: string;

  @ApiPropertyOptional({ example: 'منزل 12' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressHouse?: string;

  @ApiPropertyOptional({ example: 'Mother: 50000001' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motherContact?: string;

  @ApiPropertyOptional({ example: 'Wife: 50000002' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  wifeContact?: string;

  @ApiPropertyOptional({ example: 'Son: 50000003' })
  @Transform(({ value }: { value: unknown }) => toAddressStr(value))
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sonContact?: string;
}
