import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO تحديث حالة الوديعة مع تعليق المراجعة الاختياري
 * DTO for updating deposit status (approve/reject) with an optional audit comment.
 */
export class UpdateDepositStatusDto {
  @ApiProperty({ enum: DepositStatus })
  @IsEnum(DepositStatus)
  status!: DepositStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  auditComment?: string;
}

