import { ApiPropertyOptional } from '@nestjs/swagger';
import { KnetCommissionRule } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsNumber,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * V24 — Wave A2 (Authority Pull).
 *
 * `knetFlatKd` is the only KWD-shaped field on this DTO and is now
 * a canonical 4dp string ("0.1000") instead of a JS number. The
 * percentage fields (`knetPercentOfGross`, `cardPercentOfGross`)
 * are RATIOS, not money, so they stay as `number` — they never
 * cross the V24 `*Kd: number` purity guard.
 *
 * The controller converts `knetFlatKd` → `Prisma.Decimal` before
 * persisting, so the Prisma layer stays strictly typed.
 */
export class UpdatePaymentMethodFeesDto {
  @ApiPropertyOptional({
    example: '0.1000',
    description:
      'V24 — Flat KNET fee as canonical 4dp KWD string (e.g. "0.1000"). 1-4 decimal places accepted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message:
      'knetFlatKd must be a canonical KWD string with up to 4 decimal places (e.g. "0.1000")',
  })
  knetFlatKd?: string;

  @ApiPropertyOptional({ example: 0.015, description: 'KNET % of gross (e.g. 0.015 = 1.5%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  knetPercentOfGross?: number;

  @ApiPropertyOptional({ enum: KnetCommissionRule })
  @IsOptional()
  @IsEnum(KnetCommissionRule)
  knetRule?: KnetCommissionRule;

  @ApiPropertyOptional({ example: 0.025, description: 'Card / payment link % (e.g. 0.025 = 2.5%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cardPercentOfGross?: number;
}
