import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDriverTrackingDto {
  @ApiPropertyOptional({ example: 'Toyota LC300' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleLabel?: string;

  @ApiPropertyOptional({
    example: '29.3759,47.9774',
    description: 'Latitude/longitude as "lat,lng"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastKnownLocation?: string;
}
