import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class DailyPosSalesQueryDto {
  @ApiProperty({ example: '2026-04-15T00:00:00.000Z' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-04-15T23:59:59.999Z' })
  @IsDateString()
  to: string;
}
