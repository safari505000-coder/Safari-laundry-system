import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * V19.4 — CC pack #1. Payment methods legal for a partial-debt payment.
 *
 * Mirrors `MARK_PAID_METHODS` in `mark-order-paid.dto.ts` — we allow only
 * direct-settlement methods (Cash, KNET terminal, hosted Payment Link,
 * or online gateway confirmation). Subscription wallet and debt-on-
 * account are intentionally excluded: they represent credit movements
 * and must be resolved through their own workflows (activation /
 * plan extension), not an ad-hoc collection.
 */
export const DEBT_PAYMENT_METHODS = [
  'CASH',
  'KNET',
  'PAYMENT_LINK',
  'ONLINE',
] as const;

export type DebtPaymentMethod = (typeof DEBT_PAYMENT_METHODS)[number];

/**
 * V19.4 — CC pack #1. "سدّد جزء من المديونية مع خصم أو بدون خصم".
 *
 * Fields are KWD decimal strings (`/^\d+(\.\d{1,4})?$/`, 4dp precision)
 * rather than numbers because JS numeric types drop pennies for larger
 * amounts; the entire ledger is string-based. Validation enforces
 * non-negative values, at least one non-zero side, and a ceiling of
 * the current wallet debt (checked server-side in the service; this
 * DTO only enforces the per-field regex).
 */
export class RecordPartialDebtPaymentDto {
  @ApiProperty({
    description:
      'Cash actually collected from the customer (excludes discount). Zero means the operator only applied a goodwill discount with no money changing hands.',
    example: '1.5000',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amountKd must be a non-negative decimal with up to 4 decimals',
  })
  amountKd!: string;

  @ApiPropertyOptional({
    description:
      'Optional goodwill discount applied on top of the collected amount. Reduces the customer debt without a corresponding cash receipt. Reports tag this separately so it never inflates the "Collected Today" KPI.',
    example: '0.5000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'discountKd must be a non-negative decimal with up to 4 decimals',
  })
  discountKd?: string;

  @ApiProperty({
    enum: DEBT_PAYMENT_METHODS,
    example: 'CASH',
    description:
      'Method the customer actually used for the collected portion. Ignored when `amountKd` is 0 (discount-only forgiveness).',
  })
  @IsIn(DEBT_PAYMENT_METHODS as unknown as string[])
  paymentMethod!: DebtPaymentMethod;

  @ApiPropertyOptional({
    description:
      'Optional free-text note stored on the ledger metadata so future audits can see why a discount was granted or which driver relayed the cash.',
    maxLength: 240,
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
