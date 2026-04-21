import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleExpenseStatus, VehicleExpenseType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class VehicleExpensesQueryDto {
  @ApiPropertyOptional({ example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-30T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: VehicleExpenseStatus })
  @IsOptional()
  @IsEnum(VehicleExpenseStatus)
  status?: VehicleExpenseStatus;

  @ApiPropertyOptional({ enum: VehicleExpenseType })
  @IsOptional()
  @IsEnum(VehicleExpenseType)
  expenseType?: VehicleExpenseType;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehiclePlate?: string;
}
