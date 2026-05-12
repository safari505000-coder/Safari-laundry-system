import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosPaymentMethod } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
} from 'class-validator';

/**
 * How the employee records collection of `{@link SubscriptionPlan.salePrice}`.
 * Mirrors POS payment semantics; required server-side whenever sale price > 0.
 */
export const SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS = [
  PosPaymentMethod.CASH,
  PosPaymentMethod.KNET,
  PosPaymentMethod.PAYMENT_LINK,
  PosPaymentMethod.ONLINE,
  PosPaymentMethod.DEBT_ON_ACCOUNT,
] as const;

export type SubscriptionActivationPaymentMethod =
  (typeof SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS)[number];

export class ActivateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  planId: string;

  /**
   * V19.7.4 — when true, the activation will also walk unpaid invoices
   * for this customer oldest-first (FIFO) and mark any that are fully
   * covered by the debt-reduction portion of the activation as paid.
   * The Call Center issue/upgrade dialog also sends true so payment-link
   * invoices (unsettled receivables) clear together with `wallet.debt`.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoCloseInvoices?: boolean;

  /**
   * Mandatory on every activation: records how sale proceeds (when any)
   * were recognised. Cash/KNET/link/online book immediate POS collection;
   * `DEBT_ON_ACCOUNT` accrues the sale onto `wallet.debt`. Even when `salePrice`
   * is zero, operators must explicitly pick a channel so the ledger always
   * has a dated payment-method trail.
   */
  @ApiProperty({
    enum: SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS,
    description: 'Always required — including free (sale price = 0) plans.',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS as unknown as string[])
  paymentMethod!: SubscriptionActivationPaymentMethod;

  /**
   * V25 Deposit-then-Settle — optional override for the company subsidy
   * (marketing support) amount credited alongside the customer's payment.
   *
   * When omitted the system derives the subsidy from the plan:
   *   subsidy = max(0, plan.actualBalance − plan.salePrice)
   *
   * Providing an explicit value lets the operator record a custom support
   * amount (e.g. a promotional campaign beyond the standard plan subsidy)
   * without requiring a dedicated plan. The value MUST satisfy:
   *   paymentReceived + companySupportAmountKd = totalWalletFunding
   * which is validated server-side before any wallet mutation.
   *
   * Must be a canonical 4dp KWD string ("0.0000" to suppress subsidy).
   */
  @ApiPropertyOptional({
    example: '5.0000',
    description:
      'V25 — Company marketing-support subsidy in KWD (4dp). Defaults to max(0, plan.actualBalance − plan.salePrice).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'companySupportAmountKd must be a canonical KWD string with up to 4 decimal places',
  })
  companySupportAmountKd?: string;
}
