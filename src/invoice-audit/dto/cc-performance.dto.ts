import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * V19.9 — CC agent performance query. Defaults to today (Kuwait-local)
 * on both endpoints when omitted.
 */
export class CcPerformanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-01',
    description: 'Kuwait-local YYYY-MM-DD (inclusive). Defaults to today.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-04-30',
    description: 'Kuwait-local YYYY-MM-DD (inclusive). Defaults to today.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
