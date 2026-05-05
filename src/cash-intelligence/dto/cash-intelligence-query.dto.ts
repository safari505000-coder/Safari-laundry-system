import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CashIntelligenceQueryDto {
  /**
   * Kuwait-local YYYY-MM-DD anchor for the report. Defaults to today
   * (Asia/Kuwait) when omitted. Provided primarily for re-running an
   * old day's analysis read-only — never as a way to mutate history.
   */
  @ApiPropertyOptional({
    description: 'YYYY-MM-DD (Asia/Kuwait). Defaults to today.',
    example: '2026-05-03',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a YYYY-MM-DD string (Asia/Kuwait).',
  })
  date?: string;

  @ApiPropertyOptional({
    description:
      'Optional branch UUID. Owner / GM / Accountant may pass any branch; Branch Manager is clamped to their own JWT branch.',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
