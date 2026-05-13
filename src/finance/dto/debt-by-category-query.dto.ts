import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DebtEntityCategory } from '../enums/debt-entity-category.enum';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * معايير استعلام الديون حسب الفئة مع التصفية بالتاريخ والفئة والفرع والسائق
 * Query DTO for debt breakdown by entity category with date range and optional filters.
 */
export class DebtByCategoryQueryDto {
  @ApiProperty({ example: '2026-04-15T00:00:00.000Z' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-04-15T23:59:59.999Z' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ enum: DebtEntityCategory })
  @IsOptional()
  @IsEnum(DebtEntityCategory)
  category?: DebtEntityCategory;

  @ApiPropertyOptional({ description: 'Filter by branch UUID' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user UUID' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
