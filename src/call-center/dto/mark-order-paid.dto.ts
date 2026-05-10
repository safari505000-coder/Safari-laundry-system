import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * V1.6.9 — Collections page "تم الدفع" confirmation.
 *
 * The Call Center agent confirms the customer has paid an outstanding
 * invoice and picks the method actually used. The wallet allowed here
 * is the subset of `PosPaymentMethod` that can be closed outside the
 * gateway callback — i.e. direct-settlement methods. We explicitly
 * exclude `SUBSCRIPTION_WALLET` and `DEBT_ON_ACCOUNT` because those
 * represent credit movements that must be resolved through their own
 * workflows (activation / debt-pay-off), not a "mark as paid" flag.
 */
const MARK_PAID_METHODS = [
  'CASH',
  'KNET',
  'PAYMENT_LINK',
  'ONLINE',
] as const;

export type MarkPaidMethod = (typeof MARK_PAID_METHODS)[number];

export class MarkOrderPaidDto {
  @ApiProperty({
    enum: MARK_PAID_METHODS,
    example: 'CASH',
    description:
      'Collection method the customer actually used: Cash, KNET terminal, hosted Payment Link, or Online checkout.',
  })
  @IsIn(MARK_PAID_METHODS as unknown as string[], {
    message: 'paymentMethod must be one of: CASH, KNET, PAYMENT_LINK, ONLINE',
  })
  paymentMethod!: MarkPaidMethod;
}
