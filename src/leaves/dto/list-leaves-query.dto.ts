/**
 * استعلام قائمة الإجازات — فلاتر اختيارية للحالة والنوع والمستخدم والنطاق الزمني.
 * List-leaves query DTO — optional filters for status, type, user, and date range.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveStatus, LeaveType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ListLeavesQueryDto {
  @ApiPropertyOptional({ enum: LeaveStatus })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}
