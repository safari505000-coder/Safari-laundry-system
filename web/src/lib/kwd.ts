/** Sum decimal strings for display. Internal DTOs may carry 4dp; UI shows 3dp. */
export function sumKwdStrings(values: string[]): string {
  const n = values.reduce((acc, s) => acc + Number.parseFloat(s || '0'), 0);
  if (!Number.isFinite(n)) return '0.000';
  return n.toFixed(3);
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
  if (!Number.isFinite(raw)) return `0.000${KWD_SUFFIX}`;
  return `${formatKwdAmount(raw)}${KWD_SUFFIX}`;
}

export function formatKwdAmount(s: string | number): string {
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  if (!Number.isFinite(raw)) return '0.000';
  return raw.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  });
}

/*
 * Same canonical 3dp KWD formatting as `formatKwdLabel`, but with locale
 * grouping enabled (e.g. "12,345.000 د.ك") so KPI tiles and aggregate
 * summaries stay readable for large values. V21 Phase 4: collections
 * dashboards use this variant — they read aggregate market-debt totals
 * that routinely exceed 1,000 KWD. This stays inside the single canonical
 * formatter file so we do not introduce a parallel formatting layer.
 */
export function formatKwdLabelGrouped(s: string | number): string {
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  if (!Number.isFinite(raw)) return `0.000${KWD_SUFFIX}`;
  return `${raw.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}${KWD_SUFFIX}`;
}

/** Same as `formatKwdLabel` but prefixes `+` for credit and `-` for debt. */
export function formatSignedKwdLabel(s: string | number): string {
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  if (!Number.isFinite(raw)) return `0.000${KWD_SUFFIX}`;
  const absStr = formatKwdAmount(Math.abs(raw));
  if (raw > 0) return `+${absStr}${KWD_SUFFIX}`;
  if (raw < 0) return `-${absStr}${KWD_SUFFIX}`;
  return `${absStr}${KWD_SUFFIX}`;
}

/** Decimal string a − b (4dp) for receipt lines. */
export function subtractKwdStrings(a: string, b: string): string {
  const d =
    Number.parseFloat(a || '0') - Number.parseFloat(b || '0');
  if (!Number.isFinite(d)) return '0.000';
  return d.toFixed(3);
}

/**
 * Sign predicates on KWD decimal strings. The frontend display layer
 * must never reach for `Number.parseFloat(value) < 0` style checks on
 * a *Kd field — those re-introduce native float math on money. Use
 * these helpers instead.
 *
 * V21 Phase 2 — Canonical Financial Enforcement.
 */
export function isPositiveKd(s: string | number | null | undefined): boolean {
  if (s === null || s === undefined) return false;
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  return Number.isFinite(raw) && raw > 0;
}

export function isNegativeKd(s: string | number | null | undefined): boolean {
  if (s === null || s === undefined) return false;
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  return Number.isFinite(raw) && raw < 0;
}

export function isZeroKd(s: string | number | null | undefined): boolean {
  if (s === null || s === undefined) return true;
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  return !Number.isFinite(raw) || raw === 0;
}

/** Comparator suitable for `Array.prototype.sort` on KD decimal strings. */
export function compareKwdStrings(a: string, b: string): number {
  const an = Number.parseFloat(a || '0');
  const bn = Number.parseFloat(b || '0');
  if (!Number.isFinite(an) && !Number.isFinite(bn)) return 0;
  if (!Number.isFinite(an)) return -1;
  if (!Number.isFinite(bn)) return 1;
  return an - bn;
}

/**
 * `true` when the KD string is "material" — i.e., its absolute value
 * is at least `0.0001` (the canonical 4-decimal-place precision
 * boundary used by the backend `Prisma.Decimal` layer). Anything
 * smaller is below the smallest representable amount and should be
 * treated as zero for display + comparison purposes.
 *
 * This is the canonical replacement for the legacy
 * `Number.parseFloat(value) >= 0.0001` pattern that historically
 * guarded "is this number worth showing" UI checks.
 */
export function isMaterialKd(s: string | number | null | undefined): boolean {
  if (s === null || s === undefined) return false;
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  return Number.isFinite(raw) && Math.abs(raw) >= 0.0001;
}

// ──────────────────────────────────────────────────────────────────────
// V23.1 Phase 7 — BigInt-precise KWD arithmetic.
//
// These helpers do all summation/subtraction/absolute math in BigInt
// micro-fils (4-decimal precision matching `Prisma.Decimal`) and then
// reformat back to a canonical KWD string. This eliminates the
// floating-point drift that Native `Number(...)` introduces around
// fils boundaries (e.g. `0.1 + 0.2 = 0.30000000000000004`).
//
// Use these for ANY frontend money summation. Display-only string
// coercions stay in `formatKwdLabel*`.
// ──────────────────────────────────────────────────────────────────────

const MICRO_FILS_SCALE = 10_000n;

/** Convert a canonical KWD decimal string to BigInt micro-fils (4dp scale). */
export function kwdToMicroFils(s: string | number | null | undefined): bigint {
  if (s === null || s === undefined) return 0n;
  const raw = typeof s === 'number' ? s.toString() : s;
  const trimmed = raw.trim();
  if (trimmed === '') return 0n;
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw = '0', fracPartRaw = ''] = body.split('.');
  if (!/^\d+$/.test(intPartRaw)) return 0n;
  if (!/^\d*$/.test(fracPartRaw)) return 0n;
  const fracPart = fracPartRaw.padEnd(4, '0').slice(0, 4);
  const total = BigInt(intPartRaw) * MICRO_FILS_SCALE + BigInt(fracPart || '0');
  return negative ? -total : total;
}

/** Convert BigInt micro-fils back to a canonical 4dp KWD decimal string. */
export function microFilsToKwd(microFils: bigint): string {
  const negative = microFils < 0n;
  const abs = negative ? -microFils : microFils;
  const intPart = abs / MICRO_FILS_SCALE;
  const fracPart = abs % MICRO_FILS_SCALE;
  const fracStr = fracPart.toString().padStart(4, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracStr}`;
}

/** Decimal string a + b (4dp, BigInt-precise). Replacement for `Number(a)+Number(b)`. */
export function addKwdStrings(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): string {
  return microFilsToKwd(kwdToMicroFils(a) + kwdToMicroFils(b));
}

/**
 * BigInt-precise sum across an iterable of canonical KWD strings.
 * Returns a 4dp string. Wrap in `formatKwdLabel(...)` for display.
 *
 * This is the canonical replacement for any
 * `rows.reduce((acc, r) => acc + Number(r.amountKd), 0)` pattern.
 */
export function sumKwdStringsPrecise(
  values: Iterable<string | number | null | undefined>,
): string {
  let acc = 0n;
  for (const v of values) acc += kwdToMicroFils(v);
  return microFilsToKwd(acc);
}

/** BigInt-precise absolute value of a KWD string. */
export function absKwdString(s: string | number | null | undefined): string {
  const v = kwdToMicroFils(s);
  return microFilsToKwd(v < 0n ? -v : v);
}

/**
 * صافي رصيد ذمم العميل من اليومية (مجموع مدين − دائن على 1300)، للعرض فقط.
 * - مدين: الرصيد التراكمي موجبًا (العميل عليه ذمم للشركة).
 * - دائن: سالب (رصيد لصالح العميل).
 * - متوازن: صفر.
 */
export function formatArCustomerBalanceWithSide(
  kd: string | null | undefined,
): {
  amountDisplay: string;
  sideLabel: string;
  fullLabel: string;
} {
  const micro = kwdToMicroFils(kd);
  const abs4 = absKwdString(kd);
  const amountDisplay = formatKwdAmount(abs4);
  if (micro === 0n) {
    return {
      amountDisplay,
      sideLabel: 'متوازن',
      fullLabel: `${amountDisplay} متوازن`,
    };
  }
  if (micro > 0n) {
    return {
      amountDisplay,
      sideLabel: 'مدين',
      fullLabel: `${amountDisplay} مدين`,
    };
  }
  return {
    amountDisplay,
    sideLabel: 'دائن',
    fullLabel: `${amountDisplay} دائن`,
  };
}

/** سطر واحد للملخص مع لاحقة د.ك الصياغية. */
export function formatArCustomerBalanceSummaryLine(
  kd: string | null | undefined,
): string {
  const { amountDisplay, sideLabel } = formatArCustomerBalanceWithSide(kd);
  return `${amountDisplay}${KWD_SUFFIX} · ${sideLabel}`;
}

/**
 * RENDERING-ONLY scalar conversion of a KWD string for chart geometry.
 *
 * SVG/canvas/chart libraries need a finite Number for pixel positioning.
 * This helper makes that intent EXPLICIT and lock-in-guard-friendly so
 * a future contributor doesn't reach for `Number(value.somethingKd)` and
 * accidentally use the result in a money calculation.
 *
 * STRICT RULE: the return value of this function MUST NOT participate
 * in any further money math. It is for layout dimensions only.
 */
export function chartScalarFromKwdString(
  s: string | number | null | undefined,
): number {
  if (s === null || s === undefined) return 0;
  const raw = typeof s === 'number' ? s : Number.parseFloat(s || '0');
  return Number.isFinite(raw) ? raw : 0;
}
