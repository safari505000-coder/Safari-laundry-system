import { Prisma } from '@prisma/client';
import { round4Kd } from './round4kd.util';

/**
 * يُسلسل قيمة KWD إلى سلسلة بـ 4 منازل عشرية لاستجابات API
 * Canonical 4dp KWD string serialiser for API responses.
 * Accepts Prisma.Decimal (banker-rounded), JS number, or string.
 * Single source of truth for all response-shaping sites (V25 Controller Math Purge).
 *
 * @param value - القيمة المالية بأي صيغة | Financial value in any supported format
 * @returns سلسلة KWD بـ 4 منازل عشرية | 4dp KWD string
 * @since V25
 */
export function kwdStr(
  value:
    | Prisma.Decimal
    | { toFixed: (n: number) => string }
    | string
    | number,
): string {
  if (value instanceof Prisma.Decimal) {
    return round4Kd(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(4) : '0.0000';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toFixed(4) : '0.0000';
  }
  // Fallback: any object exposing toFixed (e.g. a Decimal-like subclass).
  return value.toFixed(4);
}
