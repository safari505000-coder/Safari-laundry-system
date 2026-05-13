/**
 * أدوات التعامل مع العملة الكويتية بوحدات 1/10000 KWD
 * KWD money arithmetic in integer minor units (1/10000 KWD = 0.0001 KD).
 * Matches DB Decimal(19,4). Used for all handover calculations and display formatting.
 */
/** Money in 1/10000 KWD integer units (matches DB Decimal(19,4)). */
const SCALE = 4;
const MULTIPLIER = 10n ** BigInt(SCALE);
const DISPLAY_SCALE = 3;

/**
 * تسامح التسليم النقدي بوحدة الأقل (0.0001 KWD)
 * Cash handover tolerance in minor units (0.0001 KWD = 1 fil).
 */
export const HANDOVER_TOLERANCE_MINOR = 1n; // 0.0001 KWD

/**
 * يُحوّل مبلغاً بصيغة Decimal(19,4) إلى وحدة الأقل كعدد bigint
 * Converts a Decimal(19,4) value to minor units (bigint).
 *
 * @param totalPrice - الكائن الذي يملك دالة toFixed | Object with toFixed
 * @returns المبلغ بوحدة الأقل | Amount in minor units
 */
export function toMinorFromFixed4(totalPrice: {
  toFixed: (n: number) => string;
}): bigint {
  return parseFixed4ToMinor(totalPrice.toFixed(4));
}

/**
 * يُحوّل سلسلة بصيغة 4 منازل عشرية إلى وحدة الأقل
 * Parses a 4dp decimal string into minor units (bigint).
 *
 * @param s - سلسلة المبلغ بصيغة "X.XXXX" | Decimal string "X.XXXX"
 * @returns المبلغ بوحدة الأقل | Minor units bigint
 */
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

/**
 * يُجمّع مبالغ الطلبات بوحدة الأقل
 * Sums an array of order amounts into total minor units.
 *
 * @param rows - صفوف الطلبات مع totalPrice | Order rows with totalPrice
 * @returns مجموع المبالغ بوحدة الأقل | Total minor units
 */
export function sumOrderMinors(
  rows: { totalPrice: { toFixed: (n: number) => string } }[],
): bigint {
  return rows.reduce((a, o) => a + toMinorFromFixed4(o.totalPrice), 0n);
}

/**
 * يُحوّل وحدة الأقل إلى سلسلة مبلغ بـ 4 منازل عشرية
 * Converts minor units (bigint) to a 4dp KWD amount string.
 *
 * @param minor - المبلغ بوحدة الأقل | Amount in minor units
 * @returns سلسلة المبلغ بصيغة "X.XXXX" | KWD amount string "X.XXXX"
 */
export function minorToAmountString(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  const intPart = v / MULTIPLIER;
  const fracPart = (v % MULTIPLIER).toString().padStart(SCALE, '0');
  return `${neg ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * نوع المدخل المالي المرن — يقبل سلاسل وأرقاماً وكائنات bigint
 * Flexible money input type accepting strings, numbers, bigints, or any toString() object.
 */
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
 * يُنسّق مبلغاً بالدينار الكويتي بـ 3 منازل عشرية للعرض
 * Formats a KWD amount with exactly 3 decimal places for display/API labels.
 * Internal accounting remains at 4dp; this is for display only.
 *
 * @param input - المبلغ بأي صيغة | Money input in any format
 * @returns المبلغ المُنسَّق بـ 3 منازل عشرية | 3dp formatted amount string
 */
export function formatKwdAmount(input: MoneyInput): string {
  return numericMoney(input).toLocaleString('en-GB', {
    minimumFractionDigits: DISPLAY_SCALE,
    maximumFractionDigits: DISPLAY_SCALE,
    useGrouping: false,
  });
}

/**
 * يُنسّق مبلغاً بالدينار الكويتي مع رمز العملة العربي
 * Formats a KWD amount with the Arabic currency label "د.ك".
 *
 * @param input - المبلغ | Money input
 * @returns مبلغ منسوب إلى الدينار الكويتي | Amount with "د.ك" suffix
 */
export function formatKwdLabel(input: MoneyInput): string {
  return `${formatKwdAmount(input)} د.ك`;
}

/**
 * يُنسّق مبلغاً بالدينار الكويتي مع إشارة الموجب أو السالب
 * Formats a signed KWD amount with +/- prefix and currency label.
 *
 * @param input - المبلغ | Money input
 * @returns مبلغ موقَّع بالدينار الكويتي | Signed KWD amount string
 */
export function formatSignedKwdLabel(input: MoneyInput): string {
  const n = numericMoney(input);
  if (n > 0) return `+${formatKwdLabel(n)}`;
  if (n < 0) return `-${formatKwdLabel(Math.abs(n))}`;
  return formatKwdLabel(0);
}

/**
 * يتحقق من تطابق المبلغ المُعلَن مع رصيد دفتر الحسابات ضمن التسامح المسموح
 * Asserts that the declared handover total matches the ledger minor total within HANDOVER_TOLERANCE_MINOR.
 *
 * @param ledgerMinor - رصيد دفتر الحسابات بوحدة الأقل | Ledger minor units total
 * @param declared - المبلغ المُعلَن | Declared number
 * @throws Error إذا تجاوز الفارق حد التسامح | If diff exceeds tolerance
 */
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
