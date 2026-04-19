import { KnetCommissionRule, Prisma } from '@prisma/client';

/**
 * V8.5 — Singleton `PaymentMethodFeeConfig` defaults (reporting-layer bank
 * commission). Must stay aligned with migration
 * `20260419140000_payment_method_fee_config` and `bank-fee.util.ts` rules.
 */
export const CANONICAL_PAYMENT_METHOD_FEE_CONFIG = {
  knetFlatKd: new Prisma.Decimal('0.1000'),
  knetPercentOfGross: new Prisma.Decimal('0.015000'),
  knetRule: KnetCommissionRule.HIGHER_OF_FLAT_AND_PERCENT,
  cardPercentOfGross: new Prisma.Decimal('0.025000'),
} as const;
