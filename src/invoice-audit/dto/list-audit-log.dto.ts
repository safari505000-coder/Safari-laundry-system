import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceAuditAction } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * V19.9 — Query filters for the Invoice Audit Log report. All fields
 * are optional; if both `from` and `to` are supplied they bound a
 * Kuwait-local YYYY-MM-DD range inclusive of both endpoints.
 */
export class ListAuditLogQueryDto {
  @ApiPropertyOptional({
    example: '2026-04-01',
    description: 'Kuwait-local YYYY-MM-DD (inclusive)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-04-30',
    description: 'Kuwait-local YYYY-MM-DD (inclusive)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({
    enum: InvoiceAuditAction,
    description: 'Filter to EDIT or VOID rows only',
  })
  @IsOptional()
  @IsEnum(InvoiceAuditAction)
  action?: InvoiceAuditAction;

  @ApiPropertyOptional({
    description: 'Filter to rows authored by this user id',
  })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
