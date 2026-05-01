import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CancelSubscriptionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Cancels this customer’s **current ACTIVE** subscription row (most recent active).',
  })
  @IsUUID('4')
  customerId!: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Optional audit note (who asked / why).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
