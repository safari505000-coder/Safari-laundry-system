/**
 * V23.2 — System-wide Canonical Money Purity guard.
 *
 * Lock-in test that scans EVERY .ts/.tsx file under both `web/src/`
 * and `src/` (backend) and proves no production code reaches for
 * raw JS numeric coercion of money fields, nor performs `+` / `-`
 * arithmetic between two `<...Kd>` identifiers.
 *
 * The ONLY allowed callsites live in the explicit `ALLOW_LIST`.
 * Each entry MUST carry a one-line rationale (POS exclusion, math
 * util boundary, lossy display, etc.). New entries require a code
 * review against the V23.2 SCORE-CARD `Money Purity Allowlist`
 * section — do NOT bypass the guard by adding a file blindly.
 *
 * If any future change introduces a new violation, this test fails
 * with the precise file + offending pattern, telling the contributor
 * exactly which canonical helper they should reach for instead:
 *
 *   FRONTEND
 *     • Summation / addition  → `addKwdStrings(a, b)` or
 *                                `sumKwdStringsPrecise([...])`
 *     • Subtraction          → `subtractKwdStrings(a, b)`
 *     • Absolute value       → `absKwdString(s)`
 *     • Sign predicates      → `isPositiveKd / isNegativeKd / isZeroKd`
 *     • Sort comparator      → `compareKwdStrings`
 *     • Chart geometry only  → `chartScalarFromKwdString(s)`
 *
 *   BACKEND
 *     • Prefer `Prisma.Decimal` for money arithmetic.
 *     • If a raw number truly is required (rating index, percentage,
 *       chart geometry), confine the coercion to a documented
 *       boundary file in the ALLOW_LIST.
 *
 * V23.2 — guard scope expanded to backend `src/` per the
 * Deep System Alignment mission. Aggressive `<id>Kd <op> <id>Kd`
 * pattern added so two money fields can no longer be added/
 * subtracted in raw JS — even when both sides happen to look like
 * Decimal-string identifiers.
 */
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB_SRC = resolve(__dirname, '..');
// `web/src/lib` → repo root is two levels up from WEB_SRC.
const REPO_ROOT = resolve(WEB_SRC, '..', '..');
const BACKEND_SRC = resolve(REPO_ROOT, 'src');

/**
 * V23.2 — files where money-coercion is intentionally allowed because
 * they ARE the canonical layer or sit at a documented boundary. Each
 * entry has a one-line rationale at the V23.2 score-card.
 */
const ALLOW_LIST: ReadonlySet<string> = new Set<string>([
  // -------------------------------------------------------------------
  // FRONTEND ALLOWLIST
  // -------------------------------------------------------------------
  // Canonical KWD helpers themselves (escape hatch lives inside
  // `chartScalarFromKwdString` for chart geometry only).
  resolve(WEB_SRC, 'lib', 'kwd.ts'),
  // POS / fee-estimation surfaces — explicitly excluded by V21 Phase 4
  // ("POS / mutation surfaces are intentionally excluded — Phase 4 is
  // forbidden from touching them per the operational constraint.")
  resolve(WEB_SRC, 'lib', 'knet-fee-estimate.ts'),
  resolve(WEB_SRC, 'modules', 'shared', 'hooks', 'use-pos-engine.ts'),
  resolve(WEB_SRC, 'utils', 'finance-engine.ts'),
  // Live monitor pulse deltas — purely visual delta animation
  // (`newPulse.cashKd - prev.cashKd`); the rendered numbers are the
  // canonical strings, the delta is only used to decide a colour
  // pulse and is intentionally lossy.
  resolve(WEB_SRC, 'pages', 'live-monitor-page.tsx'),
  // V23.3 — Collections Report was removed from the allowlist after
  // the Outstanding DTO was unified to a canonical 4dp KWD string and
  // the print-roster sort was migrated to `compareKwdStrings`. The
  // page no longer performs any `<id>Kd <op> <id>Kd` arithmetic.

  // -------------------------------------------------------------------
  // BACKEND ALLOWLIST
  // -------------------------------------------------------------------
  // Pure-math customer-360 financial engine — owns the legacy
  // `totalDueKd = invoices − payments` invariant (kept INTERNAL to
  // the engine; never exposed on the wire as of V23.2). The engine
  // reads MoneyLike inputs via a local `Number.parseFloat` helper
  // at the input boundary.
  resolve(BACKEND_SRC, 'customers', 'customer-360-financials.ts'),
  // Customer rating boundary. Coerces canonicalDebtKd string →
  // number ONCE inside `toNumber()` to drive the GOOD/WATCH/BLOCKED
  // comparator. Money math is NOT done here.
  resolve(BACKEND_SRC, 'customers', 'customer-evaluator.ts'),
  // Customer-intelligence ratio: `paymentConsistency` is a 0..1
  // ratio (NOT money), and the inputs are coerced once at the
  // ratio boundary. Documented in V23.2.
  resolve(BACKEND_SRC, 'finance', 'services', 'customer-intelligence.service.ts'),
  // sanitize-customer-360-view: `subscriptionValue` is coerced once
  // to decide whether to render the subscription line (UI-only
  // branch, not money math).
  resolve(BACKEND_SRC, 'customers', 'sanitize-customer-360-view.ts'),
  // Customer 360 service: `feedbackAverage` = Number(rating) where
  // rating is an integer 1..5 (NOT money), and the score formula
  // uses Decimal-precise debt penalty (V23.2 fix).
  resolve(BACKEND_SRC, 'customers', 'customer-360.service.ts'),
  // V23.3 — `subscription-consumption.projection.ts` was migrated to
  // `Prisma.Decimal` end-to-end. The interior arithmetic now uses
  // Decimal `.plus`/`.minus`/`.greaterThan` and the public I/O is
  // converted via `.toNumber()` only at the boundary. The file
  // therefore satisfies the V23.2 purity guard without an exception
  // and was REMOVED from this allowlist.
  // Accountant-dashboard math util — pure number arithmetic on
  // pre-validated number inputs (`handedKd: number, collectedKd: number`).
  // No string parsing, no Decimal precision loss.
  resolve(BACKEND_SRC, 'finance', 'utils', 'accountant-dashboard-math.ts'),
  // KPI trend direction — `kpiTrendDirection(Number(valueKd),
  // Number(prevKd))` produces a percentage + arrow direction
  // (intentionally lossy display indicator, NOT a money result).
  resolve(BACKEND_SRC, 'finance', 'services', 'accountant-dashboard.service.ts'),
  // Risk scoring — logarithmic risk index (intentionally lossy
  // 0..100 score), NOT money. Number cast at the score boundary.
  resolve(BACKEND_SRC, 'finance', 'risk', 'risk-scoring.service.ts'),
  // Collections-intelligence sizing component — `clamp01(parseFloat
  // (largestInvoiceKd) / 100)` is a 0..1 weighting factor for the
  // collections priority score (lossy by design).
  resolve(
    BACKEND_SRC,
    'finance',
    'collections-intelligence',
    'collections-intelligence.service.ts',
  ),
  // Driver-cash-trace DTO — the comment string contains
  // `collectedKd - handedToManagerKd` as documentation prose, not
  // executable arithmetic.
  resolve(BACKEND_SRC, 'finance', 'dto', 'driver-cash-trace.dto.ts'),
  // Exports service — `Number(row.amountKd ?? 0)` is the Excel-cell
  // boundary (XLSX numeric cell type requires a JS number).
  resolve(BACKEND_SRC, 'exports', 'exports.service.ts'),
]);

/**
 * V23.2 — forbidden patterns. The regexes are intentionally narrow
 * to keep false-positive risk near zero; the aggressive Kd+Kd
 * arithmetic pattern is the new V23.2 addition.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // `Number(<somethingKd>)` — direct JS coercion of a Kd-suffixed
  // identifier or property access.
  {
    name: 'Number(<*Kd>) coercion',
    re: /\bNumber\s*\(\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // `parseFloat(<somethingKd>)` — same shape, different fn name.
  {
    name: 'parseFloat(<*Kd>) coercion',
    re: /\bparseFloat\s*\(\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // `Number.parseFloat(<somethingKd>)`.
  {
    name: 'Number.parseFloat(<*Kd>) coercion',
    re: /\bNumber\.parseFloat\s*\(\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // V23.2 NEW — `parseInt(<somethingKd>)` coercion.
  {
    name: 'parseInt(<*Kd>) coercion',
    re: /\bparseInt\s*\(\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // V23.2 NEW — `+ <id>Kd` unary plus coercion (e.g. `+amountKd`).
  // Limited to identifiers that end in `Kd` to avoid trapping
  // legitimate `+1`, `+i`, `+timestamp`, etc.
  {
    name: 'unary + on <*Kd>',
    re: /(?<![A-Za-z0-9_$])\+\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // V23.2 NEW — `<id>Kd + <id>Kd` raw addition between two money
  // identifiers. Whitespace tolerated; either side may be a
  // property access (e.g. `row.totalKd`, `state.paidKd`).
  {
    name: '<*Kd> + <*Kd> raw addition',
    re: /\b[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\s*\+\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
  // V23.2 NEW — `<id>Kd - <id>Kd` raw subtraction.
  {
    name: '<*Kd> - <*Kd> raw subtraction',
    re: /\b[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\s*-\s*[A-Za-z_][A-Za-z0-9_$.\[\]]*Kd\b/,
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === '.next' ||
      entry === '.vite'
    )
      continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...walk(full));
    else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.(test|spec)\.tsx?$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Strip block + line comments so we never flag prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
}

const FRONTEND_SOURCES = walk(WEB_SRC).filter(
  (file) => !ALLOW_LIST.has(file),
);
const BACKEND_SOURCES = walk(BACKEND_SRC).filter(
  (file) => !ALLOW_LIST.has(file),
);

describe('V23.2 — system-wide canonical money purity (web/src/ + src/)', () => {
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    test(`no "${name}" anywhere under web/src/`, () => {
      const offenders: string[] = [];
      for (const file of FRONTEND_SOURCES) {
        const src = stripComments(readFileSync(file, 'utf8'));
        if (re.test(src)) {
          offenders.push(relative(process.cwd(), file));
        }
      }
      expect(offenders).toEqual([]);
    });

    test(`no "${name}" anywhere under src/ (backend)`, () => {
      const offenders: string[] = [];
      for (const file of BACKEND_SOURCES) {
        const src = stripComments(readFileSync(file, 'utf8'));
        if (re.test(src)) {
          offenders.push(relative(process.cwd(), file));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
