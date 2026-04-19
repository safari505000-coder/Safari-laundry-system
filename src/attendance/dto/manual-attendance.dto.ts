import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Payload for manual attendance entries (admin / HR correction). Used
 * when the SHIFT_AUTO cron misses a row and a human needs to stamp
 * check-in/out manually.
 */
export class ManualAttendanceDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Kuwait-local date, YYYY-MM-DD.' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  checkInAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  checkOutAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
