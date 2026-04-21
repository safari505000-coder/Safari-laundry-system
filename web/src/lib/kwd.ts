/** Sum decimal strings (4dp) for display — adequate for dashboard totals. */
export function sumKwdStrings(values: string[]): string {
  const n = values.reduce((acc, s) => acc + Number.parseFloat(s || '0'), 0);
  if (!Number.isFinite(n)) return '0.0000';
  return n.toFixed(4);
}

const KWD_SUFFIX = ' د.ك';

/*
 * Accepts both decimal strings (from backend DTOs) and plain numbers (from
 * in-memory accumulators like `cashTotal + knetTotal`). The Prisma layer
 * speaks strings, the frontend often reduces them into numbers for totals,
 * so this helper stays permissive on purpose.
 */
export function formatKwdLabel(s: string | number): string {
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  if (!Number.isFinite(raw)) return `${String(s)}${KWD_SUFFIX}`;
  return `${raw.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${KWD_SUFFIX}`;
}

/** Decimal string a − b (4dp) for receipt lines. */
export function subtractKwdStrings(a: string, b: string): string {
  const d =
    Number.parseFloat(a || '0') - Number.parseFloat(b || '0');
  if (!Number.isFinite(d)) return '0.0000';
  return d.toFixed(4);
}
