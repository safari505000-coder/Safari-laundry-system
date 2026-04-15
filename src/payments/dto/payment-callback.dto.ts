import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/** Normalized gateway callback — align field names with Kuwait Gateway when integrating. */
export class PaymentCallbackDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @MinLength(1)
  orderId: string;

  @ApiProperty({ example: 'success', description: 'Gateway payment outcome' })
  @IsString()
  @MinLength(1)
  status: string;

  @ApiPropertyOptional({ description: 'Amount echoed by gateway (KWD)' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({
    description:
      'HMAC-SHA256 hex of `${orderId}|${status}|${amount}` with PAYMENTS_SECRET',
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gatewayReference?: string;
}
