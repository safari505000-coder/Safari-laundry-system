import { ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * معايير استعلام قائمة الودائع مع التصفية بالحالة والسائق والاسم
 * Query DTO for the deposits list with status, driver ID, and driver name filters.
 */
export class DepositsListQueryDto {
  @ApiPropertyOptional({ enum: DepositStatus })
  @IsOptional()
  @IsEnum(DepositStatus)
  status?: DepositStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Filter by driver full name (partial, case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverName?: string;
}

