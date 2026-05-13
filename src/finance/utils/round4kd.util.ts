import { Prisma } from '@prisma/client';

/**
 * يُنسّق Decimal إلى سلسلة KWD بـ 4 منازل عشرية مع تقريب المحاسب
 * Canonical 4dp KWD string formatter using banker rounding (ROUND_HALF_EVEN).
 * Single source of truth for Decimal → KWD string conversion across Finance services.
 *
 * @param d - قيمة Decimal المُراد تنسيقها | Decimal value to format
 * @returns سلسلة KWD بـ 4 منازل عشرية | 4dp KWD string
 * @since V23.3
 */
export function round4Kd(d: Prisma.Decimal): string {
  return d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN).toFixed(4);
}
