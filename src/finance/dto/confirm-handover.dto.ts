import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class ConfirmHandoverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  driverId: string;

  @ApiPropertyOptional({
    description:
      'Physical cash counted by manager; if provided, must match ledger within 0.0001 KWD',
    example: 450.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  declaredHandoverTotal?: number;
}
