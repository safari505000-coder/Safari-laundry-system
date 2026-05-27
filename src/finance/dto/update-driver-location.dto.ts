import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** Driver self-service GPS ping — lat,lng string only. */
export class UpdateDriverLocationDto {
  @ApiProperty({
    example: '29.3759,47.9774',
    description: 'Latitude/longitude as "lat,lng"',
  })
  @IsString()
  @MaxLength(120)
  lastKnownLocation!: string;
}
