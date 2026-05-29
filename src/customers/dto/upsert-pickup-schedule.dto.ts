import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertPickupScheduleDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    example: 1,
    description: 'Day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({
    example: '18:00-20:00',
    description: 'Time window for pickup',
  })
  @IsString()
  @IsNotEmpty()
  timeWindow!: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Whether the pickup schedule is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
