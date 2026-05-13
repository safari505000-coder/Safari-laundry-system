import { Prisma } from '@prisma/client';

/**
 * Canonical 4dp KWD string formatter — banker-rounded (ROUND_HALF_EVEN).
 *
 * Single source of truth for Decimal → KWD string conversion across
 * Finance services. Extracted from `outstanding.service.ts` (V23.3)
 * so `customer-360-financials.ts` and future consumers share it without
 * duplicating the rounding algorithm.
 */
export function round4Kd(d: Prisma.Decimal): string {
  return d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN).toFixed(4);
}
