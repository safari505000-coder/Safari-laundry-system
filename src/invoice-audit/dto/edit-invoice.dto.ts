import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * V19.9 — CALL_CENTER_SUPERVISOR same-day invoice edit. Every non-
 * undefined field is applied; fields left undefined are kept as-is.
 * `reason` is optional for edits (unlike void) because an agent may
 * just want to fix a typo in the notes — but the audit log still
 * records the actor and the changed fields.
 */
export class EditInvoiceDto {
  @ApiPropertyOptional({
    description: 'New total price in KWD, string to preserve 3-dp precision',
    example: '12.500',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  totalPrice?: string;

  @ApiPropertyOptional({
    enum: PosPaymentMethod,
    description: 'Switch the payment method',
  })
  @IsOptional()
  @IsEnum(PosPaymentMethod)
  posPaymentMethod?: PosPaymentMethod;

  @ApiPropertyOptional({
    description: 'Free-text notes / remarks',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Optional free-text reason for the edit (audit metadata)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;
}
