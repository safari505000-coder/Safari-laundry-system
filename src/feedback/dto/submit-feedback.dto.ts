import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * V19.22 — public body for `POST /api/public/orders/:orderId/feedback`.
 * The customer lands on the micro-page by scanning the invoice QR, so
 * the only identity we have is the orderId (path param). No PII is
 * collected here beyond what already appears on the printed receipt.
 */
export class SubmitFeedbackDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Star rating 1..5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Free-text note (Arabic or English)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
