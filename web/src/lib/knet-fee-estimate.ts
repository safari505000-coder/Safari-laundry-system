import type { KnetCommissionRule, PaymentMethodFeeConfig } from '@/lib/api';

/**
 * Mirrors `computeOrderBankFeeKd` (KNET branch only) for client-side display.
 * Uses number math; adequate for reconciliation estimates.
 */
export function estimateKnetBankFeeKd(
  grossKd: string | number,
  config: Pick<
    PaymentMethodFeeConfig,
    'knetFlatKd' | 'knetPercentOfGross' | 'knetRule'
  >,
): number {
  const gross = Number.parseFloat(String(grossKd));
  if (!Number.isFinite(gross) || gross <= 0) return 0;

  const knetFlat = Number.parseFloat(String(config.knetFlatKd));
  const knetPct = Number.parseFloat(String(config.knetPercentOfGross));
  if (!Number.isFinite(knetFlat) || !Number.isFinite(knetPct)) return 0;

  const percentPart = gross * knetPct;
  const rule = config.knetRule as KnetCommissionRule;
  switch (rule) {
    case 'FLAT_ONLY':
      return knetFlat;
    case 'PERCENT_ONLY':
      return percentPart;
    default:
      return Math.max(knetFlat, percentPart);
  }
}

export function sumEstimatedKnetFees(
  grossAmounts: string[],
  config: Pick<
    PaymentMethodFeeConfig,
    'knetFlatKd' | 'knetPercentOfGross' | 'knetRule'
  >,
): number {
  return grossAmounts.reduce(
    (acc, g) => acc + estimateKnetBankFeeKd(g, config),
    0,
  );
}
