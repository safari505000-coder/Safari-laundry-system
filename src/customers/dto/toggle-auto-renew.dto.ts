import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleAutoRenewDto {
  @ApiProperty({
    example: true,
    description: 'Whether to enable auto-renewal for subscription',
  })
  @IsBoolean()
  autoRenew!: boolean;
}
