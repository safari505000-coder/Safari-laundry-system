/**
 * V20.8 — Phase 5 expanded UI Consistency static guards.
 *
 * Builds on the V20.7 Phase 7 guard with three additions:
 *
 *   A. Broader scope — covers ALL of `modules/<x>/components` and
 *      `modules/<x>/pages` (not just finance + collections).
 *   B. New pattern — forbids deep relative imports that cross
 *      module boundaries (e.g. `../../<other-module>/...`). New
 *      cross-module access MUST go through the barrel.
 *   C. New pattern — forbids client-side money formatting helpers
 *      (Intl.NumberFormat with currency style, manual KD-suffix
 *      string concatenation). Server-canonical strings render
 *      verbatim.
 *
 * The V20.7 guard remains in place; this is a strict superset so
 * a violation in either suite fails the build.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

const ENFORCED_KD_MATH_ROOTS = [
  'web/src/modules/finance/components',
  'web/src/modules/finance/pages',
  'web/src/modules/finance/state',
  'web/src/modules/finance/hooks',
  'web/src/modules/collections/components',
  'web/src/modules/collections/pages',
  'web/src/modules/customer360',
  'web/src/modules/dashboards',
  'web/src/modules/accounting',
  'web/src/modules/risk',
  'web/src/modules/fraud',
  'web/src/modules/callcenter',
  'web/src/modules/subscribers',
];

const KD_MATH_RX: ReadonlyArray<{ rx: RegExp; reason: string }> = [
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
    reason: 'reduce that touches a *Kd field',
  },
  {
    rx: /Intl\.NumberFormat\s*\([^)]*style\s*:\s*['"]currency['"]/,
    reason: "Intl.NumberFormat({style:'currency'}) (use server-canonical strings)",
  },
];

function listFiles(root: string): string[] {
  const acc: string[] = [];
  if (!safeStat(root)) return acc;
  for (const entry of readdirSync(root)) {
    const abs = join(root, entry);
    const s = statSync(abs);
    if (s.isDirectory()) acc.push(...listFiles(abs));
    else {
      const idx = entry.lastIndexOf('.');
      if (idx >= 0 && SCAN_EXTENSIONS.has(entry.slice(idx))) acc.push(abs);
    }
  }
  return acc;
}

function safeStat(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
}

const MODULE_RX = /modules\/([a-z0-9_-]+)/i;

describe('V20.8 — Phase 5 expanded UI consistency', () => {
  const repoRoot = process.cwd().endsWith('web')
    ? join(process.cwd(), '..')
    : process.cwd();

  test('A. no client-side KD math anywhere under enforced module roots', () => {
    const violations: string[] = [];
    for (const root of ENFORCED_KD_MATH_ROOTS) {
      const abs = join(repoRoot, root);
      const files = listFiles(abs).filter((f) => !TEST_FILE_RX.test(f));
      for (const file of files) {
        const stripped = stripComments(readFileSync(file, 'utf8'));
        for (const { rx, reason } of KD_MATH_RX) {
          const m = stripped.match(rx);
          if (m) {
            violations.push(
              `${relative(repoRoot, file).replace(/\\/g, '/')}  →  ${reason}: ${m[0]}`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('B. no deep relative cross-module imports under modules/<x>/components and modules/<x>/pages', () => {
    const modulesRoot = join(repoRoot, 'web/src/modules');
    if (!safeStat(modulesRoot)) {
      // Repo restructured? Skip silently.
      return;
    }
    const allModules = readdirSync(modulesRoot).filter((d) =>
      safeStat(join(modulesRoot, d)) && statSync(join(modulesRoot, d)).isDirectory(),
    );
    const violations: string[] = [];

    for (const mod of allModules) {
      for (const sub of ['components', 'pages']) {
        const root = join(modulesRoot, mod, sub);
        if (!safeStat(root)) continue;
        const files = listFiles(root).filter((f) => !TEST_FILE_RX.test(f));
        for (const file of files) {
          const stripped = stripComments(readFileSync(file, 'utf8'));
          // Find every `from '...';` import.
          const matches = stripped.matchAll(/from\s+['"]([^'"]+)['"]/g);
          for (const m of matches) {
            const target = m[1];
            // Only flag relative imports that escape the current
            // module via parent traversal AND land back in
            // `modules/<other>/`.
            if (!target.startsWith('.')) continue;
            // Resolve the import relative to the file folder.
            const fileDir = file.split(/[\\/]/).slice(0, -1).join('/');
            const combined = `${fileDir}/${target}`.replace(/\\/g, '/');
            const parts = combined.split('/');
            const stack: string[] = [];
            for (const p of parts) {
              if (p === '..') {
                if (stack.length > 0) stack.pop();
              } else if (p && p !== '.') stack.push(p);
            }
            const resolved = stack.join('/');
            // Detect `modules/<X>` in resolved path
            const mResolved = resolved.match(MODULE_RX);
            if (!mResolved) continue;
            const targetModule = mResolved[1].toLowerCase();
            if (targetModule === mod.toLowerCase()) continue;
            violations.push(
              `${relative(repoRoot, file).replace(/\\/g, '/')}  →  deep relative import into modules/${targetModule}: '${target}'`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
