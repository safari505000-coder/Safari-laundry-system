import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ActivateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  planId: string;
}
