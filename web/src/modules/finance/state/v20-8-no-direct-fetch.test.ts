/**
 * V20.8 — Phase 4 No-direct-fetch guard.
 *
 * Components inside `modules/finance/components/`,
 * `modules/finance/pages/`, `modules/collections/components/`,
 * and `modules/collections/pages/` MUST go through the cache
 * (`useFinancialQuery` / `useFinancialMutation`) and NEVER call
 * `apiJson` / `apiFetch` / `fetch(` directly. Direct fetches
 * defeat the cache, the dedup, the optimistic-rollback contract,
 * and the realtime-invalidation pipeline.
 *
 * The `modules/<x>/api/` and `modules/<x>/hooks/` subfolders are
 * exempt — those are exactly where typed API clients and hooks
 * live.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ENFORCED_ROOTS = [
  'web/src/modules/finance/components',
  'web/src/modules/finance/pages',
  'web/src/modules/collections/components',
  'web/src/modules/collections/pages',
];

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

const FORBIDDEN_RX: ReadonlyArray<{ rx: RegExp; reason: string }> = [
  {
    rx: /\bapiJson\s*</,
    reason: 'apiJson<…> call',
  },
  {
    rx: /\bapiJson\s*\(/,
    reason: 'apiJson(…) call',
  },
  {
    rx: /\bapiFetch\s*\(/,
    reason: 'apiFetch(…) call',
  },
  {
    rx: /(^|[^a-zA-Z_$])fetch\s*\(/,
    reason: 'window.fetch(…) call',
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

describe('V20.8 — Phase 4 no-direct-fetch guard', () => {
  const repoRoot = process.cwd().endsWith('web')
    ? join(process.cwd(), '..')
    : process.cwd();

  for (const root of ENFORCED_ROOTS) {
    test(`no direct apiJson / apiFetch / fetch in ${root}`, () => {
      const abs = join(repoRoot, root);
      const files = listFiles(abs).filter((f) => !TEST_FILE_RX.test(f));
      const violations: string[] = [];
      for (const file of files) {
        const stripped = stripComments(readFileSync(file, 'utf8'));
        for (const { rx, reason } of FORBIDDEN_RX) {
          const m = stripped.match(rx);
          if (m) {
            violations.push(
              `${file
                .replace(repoRoot + '\\', '')
                .replace(repoRoot + '/', '')
                .replace(/\\/g, '/')}  →  ${reason}: ${m[0].trim()}`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
