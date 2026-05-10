/**
 * V21 Phase 1 (Core Freeze) — cross-module financial-import guard.
 *
 * The `web/src/modules/finance/` module owns three internal layers
 * that no other module is allowed to reach into:
 *
 *   • `state/`   — `financial-cache`, `financial-realtime`,
 *                  `financial-mutation`. These manage React Query
 *                  caches + invalidation patterns for canonical
 *                  financial data. Direct imports leak the
 *                  cache-key contract across modules and re-introduce
 *                  the duplicated-balance-projection problem.
 *
 *   • `api/`     — `finance-api`, `observability-api`. These are
 *                  the canonical thin clients over the backend
 *                  finance endpoints. Direct imports break the
 *                  V20.9 single-fetch-channel guarantee.
 *
 *   • `hooks/`   — `use-financial-observability`. Module-internal
 *                  composition hook; meant to be re-exported via
 *                  the public barrel only.
 *
 * Public surface = `@/modules/finance` (barrel) + the
 * `@/modules/finance/components/*` UI Kit (which is intentionally
 * deep-importable because each component has a stable single-file
 * identity and is documented in `v20-7-design-system.test.tsx`).
 *
 * Together with the V20.9 `module-only-architecture` guard (which
 * forbids the legacy → modules direction), this lock-down keeps
 * the `finance` module import-boundary auditable in code review.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

const FORBIDDEN_DEEP_PREFIXES = [
  '@/modules/finance/state/',
  '@/modules/finance/api/',
  '@/modules/finance/hooks/',
];

/** Files allowed to import the private `finance` internals. */
const FINANCE_INTERNAL_ALLOWLIST_PREFIX = 'web/src/modules/finance/';

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

describe('V21 Phase 1 — cross-module finance-internal import guard', () => {
  const repoRoot = process.cwd().endsWith('web')
    ? join(process.cwd(), '..')
    : process.cwd();
  const webSrcRoot = join(repoRoot, 'web/src');

  test('no module outside @/modules/finance imports finance internals (state/, api/, hooks/)', () => {
    const allFiles = listFiles(webSrcRoot).filter(
      (f) => !TEST_FILE_RX.test(f),
    );
    const violations: string[] = [];
    for (const file of allFiles) {
      const rel = relative(repoRoot, file).replace(/\\/g, '/');
      // The finance module itself may freely use its own internals
      if (rel.startsWith(FINANCE_INTERNAL_ALLOWLIST_PREFIX)) continue;
      const stripped = stripComments(readFileSync(file, 'utf8'));
      const matches = stripped.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const m of matches) {
        const target = m[1];
        for (const bad of FORBIDDEN_DEEP_PREFIXES) {
          if (target.startsWith(bad)) {
            violations.push(`${rel}  →  imports private '${target}'`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('finance module exposes a public barrel at @/modules/finance', () => {
    const indexPath = join(repoRoot, 'web/src/modules/finance/index.ts');
    expect(safeStat(indexPath)).toBe(true);
    const source = readFileSync(indexPath, 'utf8');
    // The public barrel must re-export *something*; otherwise it is
    // a defunct file. We do not pin specific exports because the
    // surface evolves, but it must not be empty.
    expect(source.trim().length).toBeGreaterThan(0);
    expect(/export\s+/.test(source)).toBe(true);
  });
});
