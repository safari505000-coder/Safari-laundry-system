/** Money in 1/10000 KWD integer units (matches DB Decimal(19,4)). */
const SCALE = 4;
const MULTIPLIER = 10n ** BigInt(SCALE);
const DISPLAY_SCALE = 3;

export const HANDOVER_TOLERANCE_MINOR = 1n; // 0.0001 KWD

export function toMinorFromFixed4(totalPrice: {
  toFixed: (n: number) => string;
}): bigint {
  return parseFixed4ToMinor(totalPrice.toFixed(4));
}

export function parseFixed4ToMinor(s: string): bigint {
  const t = s.trim();
  const neg = t.startsWith('-');
  const u = neg ? t.slice(1) : t;
  const [wRaw, fRaw = ''] = u.split('.');
  const w = wRaw === '' ? '0' : wRaw;
  const frac = (fRaw + '0000').slice(0, SCALE).padEnd(SCALE, '0');
  const minor = BigInt(w) * MULTIPLIER + BigInt(frac);
  return neg ? -minor : minor;
}

export function declaredNumberToMinor(declared: number): bigint {
  if (!Number.isFinite(declared) || declared <= 0) {
    throw new Error('declaredHandoverTotal must be a finite positive number');
  }
  return parseFixed4ToMinor(declared.toFixed(4));
}

export function sumOrderMinors(
  rows: { totalPrice: { toFixed: (n: number) => string } }[],
): bigint {
  return rows.reduce((a, o) => a + toMinorFromFixed4(o.totalPrice), 0n);
}

export function minorToAmountString(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  const intPart = v / MULTIPLIER;
  const fracPart = (v % MULTIPLIER).toString().padStart(SCALE, '0');
  return `${neg ? '-' : ''}${intPart}.${fracPart}`;
}

export type MoneyInput =
  | string
  | number
  | bigint
  | { toString(): string }
  | null
  | undefined;

function numericMoney(input: MoneyInput): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'bigint') {
    return Number(input) / Number(MULTIPLIER);
  }
  const n =
    typeof input === 'number'
      ? input
      : Number.parseFloat(input.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Canonical KWD display format: exactly 3 decimal places.
 *
 * Internal accounting remains Decimal(19,4) / 1e-4 minor units. This helper is
 * for display/API labels only and is the shared source for "3.250 / 0.000".
 */
export function formatKwdAmount(input: MoneyInput): string {
  return numericMoney(input).toLocaleString('en-GB', {
    minimumFractionDigits: DISPLAY_SCALE,
    maximumFractionDigits: DISPLAY_SCALE,
    useGrouping: false,
  });
}

export function formatKwdLabel(input: MoneyInput): string {
  return `${formatKwdAmount(input)} د.ك`;
}

export function formatSignedKwdLabel(input: MoneyInput): string {
  const n = numericMoney(input);
  if (n > 0) return `+${formatKwdLabel(n)}`;
  if (n < 0) return `-${formatKwdLabel(Math.abs(n))}`;
  return formatKwdLabel(0);
}

export function assertDeclaredMatchesLedgerMinor(
  ledgerMinor: bigint,
  declared: number,
): void {
  const declaredMinor = declaredNumberToMinor(declared);
  const diff =
    ledgerMinor >= declaredMinor
      ? ledgerMinor - declaredMinor
      : declaredMinor - ledgerMinor;
  if (diff > HANDOVER_TOLERANCE_MINOR) {
    throw new Error(
      `Declared total ${minorToAmountString(declaredMinor)} does not match ledger ${minorToAmountString(ledgerMinor)} (tolerance ±${minorToAmountString(HANDOVER_TOLERANCE_MINOR)} KWD)`,
    );
  }
}
