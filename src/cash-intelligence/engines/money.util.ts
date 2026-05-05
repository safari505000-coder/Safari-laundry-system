/**
 * Money helpers — fixed-point KWD with 4 decimal places.
 *
 * 1 KD = 10_000 minor units. We never use floating point for money
 * inside the pipeline; engines pass bigint and only the response edge
 * formats to the canonical `12.5000` string.
 */
import { Prisma } from '@prisma/client';

export function fixed4ToMinor(
  value: Prisma.Decimal | string | number | null | undefined,
): bigint {
  if (value === null || value === undefined) return 0n;
  const raw =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? value.toFixed(4)
        : value.toFixed(4);
  const trimmed = raw.trim();
  const sign = trimmed.startsWith('-') ? -1n : 1n;
  const clean = trimmed.replace(/^-/, '');
  const [whole, frac = ''] = clean.split('.');
  const frac4 = `${frac}0000`.slice(0, 4);
  return sign * (BigInt(whole || '0') * 10_000n + BigInt(frac4));
}

export function minorToFixed4(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const whole = abs / 10_000n;
  const frac = (abs % 10_000n).toString().padStart(4, '0');
  return `${sign}${whole}.${frac}`;
}

export function absMinor(value: bigint): bigint {
  return value < 0n ? -value : value;
}
