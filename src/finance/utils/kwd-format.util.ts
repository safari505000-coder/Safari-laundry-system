import { Prisma } from '@prisma/client';
import { round4Kd } from './round4kd.util';

/**
 * Canonical 4dp KWD string serialiser for API responses.
 *
 * Accepts the three value shapes that appear across backend response
 * builders: `Prisma.Decimal` (uses banker-rounded `round4Kd`), plain
 * JS `number`, and `string` KWD values from intermediate aggregations.
 *
 * Single source of truth — extracted from `payments.controller.ts`
 * (V25 Controller Math Purge) and `debt.service.ts` so that every
 * response-shaping site uses the same rounding and fallback logic.
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
