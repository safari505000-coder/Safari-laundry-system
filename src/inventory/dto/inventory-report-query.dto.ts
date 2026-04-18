import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum StockStatusFilter {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

/**
 * Multi-layer filter input for the Smart Inventory report (Dastur §4).
 * Any combination of category / branch / stock-status may be applied.
 */
export class InventoryReportQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ enum: StockStatusFilter })
  @IsOptional()
  @IsEnum(StockStatusFilter)
  status?: StockStatusFilter;
}
