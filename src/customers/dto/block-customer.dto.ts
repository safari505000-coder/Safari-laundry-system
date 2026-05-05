import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * V19.x — Body for `POST /api/customers/:id/block` (manual call-center block).
 * Distinct from the auto-block path which fires off debt thresholds without
 * any operator input.
 */
export class BlockCustomerDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 240,
    example: 'العميل يرفض السداد رغم التذكير المتكرر',
    description:
      'Operator-supplied reason for the manual block. Stored on Customer.blockReason and embedded in the CUSTOMER_BLOCKED audit log row.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason!: string;
}

/**
 * V19.x — Body for `POST /api/customers/:id/unblock`. Reason is optional
 * (some unblocks are administrative cleanup with no narrative needed) but
 * always recorded in the audit log when supplied.
 */
export class UnblockCustomerDto {
  @ApiPropertyOptional({
    maxLength: 240,
    example: 'تم تسوية الدين كاملًا',
    description:
      'Optional narrative for the audit row only. Customer.blockReason is always cleared regardless.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
