/**
 * V20.9 — Phase 5 module-only architecture guard.
 *
 * Forbids any file under `web/src/modules/` from importing legacy
 * pages (`web/src/pages/`) or legacy flat components
 * (`web/src/components/`). Together with the V20.8 deprecation
 * guard and the V20.8 expanded UI consistency guard, this locks
 * the architectural direction: legacy → modular ONLY (never the
 * other way).
 *
 * # Why
 *
 *   The legacy `web/src/pages/` cluster (76 files) operates as a
 *   quarantine zone that migrates opportunistically. New work
 *   inside `modules/` must NOT depend on the quarantine — that
 *   would couple the new architecture to the very thing we are
 *   removing.
 *
 * # Allow-list
 *
 *   `web/src/lib/` is intentionally excluded from this check —
 *   `lib/api.ts` is the pre-V20.7 god-file every page consumes.
 *   Splitting it via additive re-exports is queued for V20.10.
 *
 * # Exception channel
 *
 *   Adding to `grandfathered` requires reading
 *   `docs/v20-9-final-report.md` first (same protocol as V20.8).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

/**
 * Forbidden prefixes — every entry MUST have a modular
 * replacement. Shared utilities without a modular home today
 * (`@/components/i18n`, `@/components/system`, `@/components/common`)
 * are intentionally NOT in this list and are queued for V20.10
 * migration per the V20.8 ownership charter.
 */
const FORBIDDEN_PREFIXES = [
  '@/pages/',                  // legacy page cluster — always replaceable
  '@/components/layout/',      // Header/Sidebar (V20.8 deprecated, deleted)
  '@/components/expenses/',    // expenses-insights-panel (V20.8 deprecated, deleted)
];

const GRANDFATHERED = new Set<string>([
  // No exceptions today. Adding one requires updating the V20.9 final report.
]);

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

describe('V20.9 — Phase 5 module-only architecture', () => {
  const repoRoot = process.cwd().endsWith('web')
    ? join(process.cwd(), '..')
    : process.cwd();

  test('no file under web/src/modules/ imports from @/pages or @/components', () => {
    const modulesRoot = join(repoRoot, 'web/src/modules');
    if (!safeStat(modulesRoot)) return; // repo restructured

    const files = listFiles(modulesRoot).filter(
      (f) => !TEST_FILE_RX.test(f),
    );
    const violations: string[] = [];
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf8'));
      const matches = stripped.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const m of matches) {
        const target = m[1];
        for (const bad of FORBIDDEN_PREFIXES) {
          if (target.startsWith(bad)) {
            const rel = file
              .replace(repoRoot + '\\', '')
              .replace(repoRoot + '/', '')
              .replace(/\\/g, '/');
            if (GRANDFATHERED.has(rel)) continue;
            violations.push(
              `${rel}  →  imports legacy '${target}'`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
