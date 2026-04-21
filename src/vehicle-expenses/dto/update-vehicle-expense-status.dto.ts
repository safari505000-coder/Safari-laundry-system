import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleExpenseStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * V19.10 — Accountant decision payload. A REJECTED status requires a
 * reason; approve = empty reason. Enforced in the service layer so the
 * DTO stays permissive for future "AUDIT" or "REOPEN" transitions.
 */
export class UpdateVehicleExpenseStatusDto {
  @ApiProperty({ enum: VehicleExpenseStatus })
  @IsEnum(VehicleExpenseStatus)
  status!: VehicleExpenseStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}
