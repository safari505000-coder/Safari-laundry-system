import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const MAX_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;

export function defaultFromIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_RANGE_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function defaultToIso(): string {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

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
