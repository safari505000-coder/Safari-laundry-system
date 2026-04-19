import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLeaveDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  type!: LeaveType;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD).' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD, inclusive).' })
  @IsISO8601()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RejectLeaveDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
