import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * V19.9 — CALL_CENTER_SUPERVISOR invoice soft-void. Reason is
 * mandatory and is surfaced verbatim in the audit log report so the
 * Owner / GM / Accountant can triage without opening the row.
 */
export class VoidInvoiceDto {
  @ApiProperty({
    description: 'Required reason for voiding the invoice',
    minLength: 5,
    maxLength: 500,
    example: 'إلغاء بناءً على طلب العميل بعد دفع الإيصال الخاطئ',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
