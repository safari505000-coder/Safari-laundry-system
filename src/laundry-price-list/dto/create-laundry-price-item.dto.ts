import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * OWNER-only payload for creating a new `LaundryPriceListItem`.
 *
 * Prices default to 0 so the item can be created first and priced later via
 * the standard PATCH route. `code` is a stable business identifier — it must
 * be uppercase ASCII + digits / dashes so external manifests (print-outs,
 * PDFs) stay legible.
 */
export class CreateLaundryPriceItemDto {
  @ApiProperty({ description: 'Stable code (e.g. ABA-001). Uppercase.' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/u, {
    message: 'code must be uppercase ASCII letters, digits, hyphen, or underscore',
  })
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'When true the item is priced manually per order (list prices may be 0).',
  })
  @IsOptional()
  @IsBoolean()
  manualEntry?: boolean;

  @ApiPropertyOptional({ description: 'KD price — up to 4 decimal places' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceNormal?: number;

  @ApiPropertyOptional({ description: 'KD price — up to 4 decimal places' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceUrgent?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pricePressOnly?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceUrgentPress?: number | null;
}
