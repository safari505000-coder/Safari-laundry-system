import { KnetCommissionRule, PosPaymentMethod, Prisma } from '@prisma/client';

export type PaymentFeeConfigShape = {
  knetFlatKd: Prisma.Decimal | string;
  knetPercentOfGross: Prisma.Decimal | string;
  knetRule: KnetCommissionRule;
  cardPercentOfGross: Prisma.Decimal | string;
};

/**
 * V8.5 — Reporting-layer bank commission only. Does not change invoice totals.
 *
 * - CASH: no fee
 * - SUBSCRIPTION_WALLET / DEBT_ON_ACCOUNT: no per-tx acquirer fee
 * - KNET: per `knetRule` (default: max of flat 0.100 KD and 1.5% of gross)
 * - PAYMENT_LINK / ONLINE: % of gross (default 2.5%)
 */
export function computeOrderBankFeeKd(
  grossKd: Prisma.Decimal | string | number,
  method: PosPaymentMethod | null | undefined,
  config: PaymentFeeConfigShape,
): Prisma.Decimal {
  const gross = new Prisma.Decimal(grossKd.toString());
  if (!method || method === PosPaymentMethod.CASH) {
    return new Prisma.Decimal(0);
  }
  if (
    method === PosPaymentMethod.SUBSCRIPTION_WALLET ||
    method === PosPaymentMethod.DEBT_ON_ACCOUNT
  ) {
    return new Prisma.Decimal(0);
  }

  const knetFlat = new Prisma.Decimal(config.knetFlatKd.toString());
  const knetPct = new Prisma.Decimal(config.knetPercentOfGross.toString());
  const cardPct = new Prisma.Decimal(config.cardPercentOfGross.toString());

  if (method === PosPaymentMethod.KNET) {
    const percentPart = gross.mul(knetPct);
    switch (config.knetRule) {
      case KnetCommissionRule.FLAT_ONLY:
        return knetFlat;
      case KnetCommissionRule.PERCENT_ONLY:
        return percentPart;
      default:
        return knetFlat.gt(percentPart) ? knetFlat : percentPart;
    }
  }

  if (
    method === PosPaymentMethod.PAYMENT_LINK ||
    method === PosPaymentMethod.ONLINE
  ) {
    return gross.mul(cardPct);
  }

  return new Prisma.Decimal(0);
}
