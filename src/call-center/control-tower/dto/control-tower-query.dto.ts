import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Time-window preset for outstanding aggregates (`Order.createdAt`).
 * `all` = entire unpaid portfolio (default).
 */
export enum ControlTowerPreset {
  ALL = 'all',
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
}

export class ControlTowerQueryDto {
  @ApiPropertyOptional({
    enum: ControlTowerPreset,
    default: ControlTowerPreset.ALL,
    description:
      'Restrict unpaid invoices by `Order.createdAt` (Kuwait-aligned bounds for today/month).',
  })
  @IsOptional()
  @IsEnum(ControlTowerPreset)
  preset?: ControlTowerPreset;

  @ApiPropertyOptional({
    description:
      'Optional driver UUID — limits rows to customers with this driver on an unpaid row or on an active dispatch.',
  })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({
    description: 'Maximum rows in `rows` (1–200). Default 50.',
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) {
      const n = Number.parseInt(value, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  topLimit?: number;
}
