import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * OWNER-only partial update for `LaundryPriceListItem`.
 * All fields optional: caller may patch a single price tier without shipping the rest.
 * `priceNormal`/`priceUrgent` are required tiers at schema level — they accept numbers only.
 * `pricePressOnly`/`priceUrgentPress` are nullable tiers — pass `null` to clear.
 */
export class UpdateLaundryPriceItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  manualEntry?: boolean;

  @ApiPropertyOptional({ description: 'KD price, up to 4 decimal places' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceNormal?: number;

  @ApiPropertyOptional({ description: 'KD price, up to 4 decimal places' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceUrgent?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Pass null to clear; number for KD price',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pricePressOnly?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Pass null to clear; number for KD price',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceUrgentPress?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;
}
