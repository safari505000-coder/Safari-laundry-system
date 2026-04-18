import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Dastur §3 — Manager uploads bank deposit slip photo for a pending custody bag.
 * Body is JSON; the slip image itself is uploaded via multipart to
 * POST /api/manager-custody/upload-slip-image (Driver handover receipt pattern).
 */
export class UploadDepositSlipDto {
  @ApiProperty({
    description:
      'Public URL of the uploaded deposit slip image (from POST /api/manager-custody/upload-slip-image).',
    example: '/uploads/deposit-slips/9f3c…-slip.jpg',
  })
  @IsString()
  @MinLength(8)
  depositSlipUrl: string;

  @ApiPropertyOptional({
    description:
      'Declared deposited amount (KWD). Must match custody amount within 0.0001 KWD.',
    example: 450.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  declaredDepositTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
