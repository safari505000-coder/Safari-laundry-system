/**
 * V20.7 — Phase 7 UI Consistency Guard.
 *
 * STATIC sweep that prevents NEW UI financial math from leaking
 * into the V20.7 financial design system. The Phase 3 + Phase 5
 * surfaces MUST render server-canonical KD strings verbatim — no
 * client-side `+`, `-`, `*`, `Math.round`, `parseFloat` of a KD
 * field, or `.toFixed()` of any field whose name ends in `Kd`.
 *
 * Why a static guard? The runtime `UiDriftInspectorService` catches
 * value drift across stored debt sources, but it cannot catch a
 * developer who computes `total = paid + remaining` inside a
 * component on next Tuesday. This test catches that at PR time.
 *
 * Allow-list policy:
 *   • Tests are exempt (they assemble fixture KD strings).
 *   • The `WindowedList`, `CustomerFinancialHeader` virtualization
 *     helpers may use `Math.floor` for *layout indices* (NOT KD).
 *   • Comments and JSDoc text are stripped before scanning.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOTS = [
  'src/modules/finance/components',
  'src/modules/collections/components',
  'src/modules/collections/pages',
];

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec|perf\.test)\.tsx?$/;

// Patterns that indicate UI-side financial arithmetic on KD fields.
const FORBIDDEN: Array<{ rx: RegExp; reason: string }> = [
  {
    rx: /parseFloat\s*\(\s*[A-Za-z_][A-Za-z0-9_.]*Kd\b/,
    reason: 'parseFloat over a *Kd field',
  },
  {
    rx: /[A-Za-z_][A-Za-z0-9_.]*Kd\s*\.\s*toFixed\s*\(/,
    reason: '.toFixed() on a *Kd field',
  },
  {
    rx: /[A-Za-z_][A-Za-z0-9_.]*Kd\s*[+\-*/]\s*[A-Za-z_0-9.]/,
    reason: 'arithmetic on a *Kd field',
  },
  {
    rx: /Math\.round\s*\([^)]*Kd\b/,
    reason: 'Math.round on a *Kd field',
  },
  {
    rx: /Number\s*\(\s*[A-Za-z_][A-Za-z0-9_.]*Kd\b/,
    reason: 'Number() coercion of a *Kd field',
  },
  {
    rx: /\.reduce\s*\([^)]*Kd\b/,
    reason: 'reduce that touches a *Kd field (would be client-side total)',
  },
];

function listFiles(root: string): string[] {
  const acc: string[] = [];
  if (!exists(root)) return acc;
  for (const entry of readdirSync(root)) {
    const abs = join(root, entry);
    const s = statSync(abs);
    if (s.isDirectory()) {
      acc.push(...listFiles(abs));
    } else if (SCAN_EXTENSIONS.has(extOf(entry))) {
      acc.push(abs);
    }
  }
  return acc;
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  const j = name.lastIndexOf('.', i - 1);
  if (j >= 0 && /\.(test|spec|perf\.test)$/.test(name.slice(0, i))) {
    return name.slice(j);
  }
  return name.slice(i);
}

/** Strip block comments and line comments so we never flag prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
}

describe('V20.7 — Phase 7 UI Consistency Guard', () => {
  const repoRoot = process.cwd().endsWith('web')
    ? process.cwd()
    : join(process.cwd(), 'web');

  for (const root of ROOTS) {
    const absRoot = join(repoRoot, root);
    test(`no client-side KD math in ${root}`, () => {
      const files = listFiles(absRoot).filter((f) => !TEST_FILE_RX.test(f));
      const violations: string[] = [];
      for (const file of files) {
        const stripped = stripComments(readFileSync(file, 'utf8'));
        for (const { rx, reason } of FORBIDDEN) {
          const m = stripped.match(rx);
          if (m) {
            violations.push(
              `${file.replace(repoRoot + '\\', '').replace(/\\/g, '/')}  →  ${reason}: ${m[0]}`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }

  test('the design system barrel re-exports are non-empty', () => {
    const barrel = join(
      repoRoot,
      'src/modules/finance/components/index.ts',
    );
    const text = readFileSync(barrel, 'utf8');
    expect(text).toContain('PaymentStatusChip');
    expect(text).toContain('OutstandingTable');
    expect(text).toContain('FinancialTimeline');
    expect(text).toContain('CustomerFinancialHeader');
    expect(text).toContain('FinancialErrorBoundary');
  });
});
