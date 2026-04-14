/** Money in 1/10000 KWD integer units (matches DB Decimal(19,4)). */
const SCALE = 4;
const MULTIPLIER = 10n ** BigInt(SCALE);

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
