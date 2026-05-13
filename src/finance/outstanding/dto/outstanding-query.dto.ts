import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CustomerCollectionStatusKind } from '@prisma/client';

/**
 * V19.x — Filters accepted by `GET /api/finance/outstanding`.
 * Pure read-side query object: nothing here mutates state and the
 * blocked / status filters are applied AFTER aggregation.
 * Headline `totalDueKd` matches the Collections red KPI when no narrowing
 * filters are applied (branch scope follows JWT + optional `branchId`).
 */
/**
 * معايير استعلام قائمة المديونيات المعلقة — للقراءة فقط
 * Outstanding (AR) list query DTO. Pure read-side filters applied after aggregation.
 * Headline totalDueKd matches Collections red KPI when no narrowing filters are applied.
 * @since V19.x
 */
export class OutstandingQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive ISO-8601 lower bound on Order.createdAt.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive ISO-8601 upper bound on Order.createdAt.',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Branch scope (optional). Same semantics as Collections / operations-summary `branchId`.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by the assigned driver.' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single customer.' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    enum: CustomerCollectionStatusKind,
    description: 'Filter by the AR collection-status flag.',
  })
  @IsOptional()
  @IsEnum(CustomerCollectionStatusKind)
  status?: CustomerCollectionStatusKind;

  @ApiPropertyOptional({
    description: 'Free-text search over customer name / phone.',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;

  @ApiPropertyOptional({
    description: 'When true, return blocked customers only.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    return undefined;
  })
  blocked?: boolean;
}
