import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;

/**
 * يُرجع تاريخ البداية الافتراضي لدفتر الأستاذ (30 يوم قبل اليوم)
 * Returns the default ledger query from-date (30 days ago at UTC midnight).
 *
 * @returns تاريخ البداية الافتراضي بتنسيق ISO | Default from-date ISO string
 */
export function defaultFromIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_RANGE_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * يُرجع تاريخ النهاية الافتراضي لدفتر الأستاذ (نهاية اليوم الحالي)
 * Returns the default ledger query to-date (end of current UTC day).
 *
 * @returns تاريخ النهاية الافتراضي بتنسيق ISO | Default to-date ISO string
 */
export function defaultToIso(): string {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * يتحقق من أن النطاق الزمني لا يتجاوز الحد الأقصى المسموح (90 يوماً)
 * Asserts the date range does not exceed MAX_RANGE_DAYS (90 days).
 *
 * @param fromIso - تاريخ البداية بتنسيق ISO | Start date ISO string
 * @param toIso - تاريخ النهاية بتنسيق ISO | End date ISO string
 * @throws Error إذا تجاوز النطاق الحد الأقصى | If range exceeds MAX_RANGE_DAYS
 */
export function assertWithinMaxRange(fromIso: string, toIso: string): void {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid ISO date');
  }
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_RANGE_DAYS + 0.5) {
    throw new Error(`range exceeds ${MAX_RANGE_DAYS} days`);
  }
}

/**
 * معايير استعلام نطاق دفتر الأستاذ — من وإلى بتنسيق ISO مع قيم افتراضية
 * Ledger range query DTO with optional from/to dates defaulting to the last 30 days.
 */
export class LedgerRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO8601 from (default: 30d ago)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO8601 to (default: now)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/**
 * معايير استعلام معاملات دفتر الأستاذ مع تصفية الحساب والحد الأقصى للصفوف
 * Ledger transactions query DTO extending range with accountId prefix filter and take limit.
 */
export class LedgerTransactionsQueryDto extends LedgerRangeQueryDto {
  @ApiPropertyOptional({ description: 'Filter by accountId prefix (e.g. DRIVER_ or BANK_ACCOUNT)' })
  @IsOptional()
  @IsString()
  accountPrefix?: string;

  @ApiPropertyOptional({ default: 200, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;
}
