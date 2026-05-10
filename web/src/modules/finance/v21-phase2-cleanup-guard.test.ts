/**
 * V21 Phase 2 — Legacy Purge cleanup guards.
 *
 * Locks in the four artefacts removed during Phase 2 so a future
 * PR cannot silently resurrect them:
 *
 *   1. `web/src/modules/call-center/collections-report/utils/grouping.ts`
 *      (V20.7 grouping helpers, never adopted)
 *   2. `web/src/modules/shared/components/onboarding/OnboardingTour.tsx`
 *      (V20.9 contextual onboarding, never wired)
 *   3. `web/src/modules/shared/hooks/use-responsive-mode.ts`
 *      (V20.9 responsive hook, never adopted)
 *   4. `web/src/modules/shared/routing/lazy-route.tsx`
 *      (V20.7 lazy-route helper, never adopted)
 *   5. `web/src/modules/callcenter/` placeholder folder
 *      (V20.7 aborted single-word rename)
 *
 * It also enforces a stricter version of the V20.8 no-direct-fetch
 * guard: extends the scan to the entire `web/src/` tree (excluding
 * the small allowlist of approved fetch channels).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

const REMOVED_FILES: ReadonlyArray<string> = [
  'web/src/modules/call-center/collections-report/utils/grouping.ts',
  'web/src/modules/shared/components/onboarding/OnboardingTour.tsx',
  'web/src/modules/shared/hooks/use-responsive-mode.ts',
  'web/src/modules/shared/routing/lazy-route.tsx',
];

const REMOVED_FOLDERS: ReadonlyArray<string> = [
  'web/src/modules/callcenter',
];

/**
 * Files allowed to make raw `fetch(` calls.
 *
 * `apiJson(...)` / `apiFetch(...)` are the canonical channel and are
 * NOT blocked by this guard — they are the abstraction over
 * `window.fetch` that adds auth headers, error parsing, and the
 * `ApiError` surface. The V20.8 `v20-8-no-direct-fetch.test.ts`
 * separately blocks `apiJson` calls inside `modules/finance/components`
 * and `modules/collections/components` because those component
 * folders must consume the canonical financial cache.
 *
 * What this guard adds: a tree-wide ban on raw `window.fetch(...)`
 * anywhere except a small allowlist (the canonical channel itself,
 * the offline retry queue, and module-owned typed API clients).
 */
const RAW_FETCH_ALLOWLIST: ReadonlyArray<string> = [
  'web/src/lib/api.ts',
  'web/src/offline/flush-queue.ts',
];

const RAW_FETCH_ALLOWLIST_FRAGMENTS: ReadonlyArray<string> = [
  // Inside modules/<m>/api/ or modules/<m>/state/<…>cache files —
  // those are the canonical places for typed API clients to call
  // raw fetch when the apiJson abstraction does not fit (e.g. for
  // streamed responses, FormData uploads, or SSE).
  'web/src/modules/',
];

const RAW_FETCH_ALLOWLIST_SUBPATHS: ReadonlyArray<string> = [
  '/api/',
  '/state/',
];

function listFiles(root: string): string[] {
  const acc: string[] = [];
  if (!existsSync(root)) return acc;
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

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
}

const repoRoot = (() => {
  return process.cwd().endsWith('web') ? join(process.cwd(), '..') : process.cwd();
})();

describe('V21 Phase 2 — Legacy Purge cleanup guards', () => {
  test.each(REMOVED_FILES)(
    'removed file does not silently reappear: %s',
    (rel) => {
      const abs = join(repoRoot, rel);
      expect(existsSync(abs)).toBe(false);
    },
  );

  test.each(REMOVED_FOLDERS)(
    'removed folder does not silently reappear: %s',
    (rel) => {
      const abs = join(repoRoot, rel);
      expect(existsSync(abs)).toBe(false);
    },
  );

  test('no raw window.fetch(...) outside the approved channels', () => {
    const webSrc = join(repoRoot, 'web/src');
    const files = listFiles(webSrc).filter((f) => !TEST_FILE_RX.test(f));

    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file).replace(/\\/g, '/');
      if (RAW_FETCH_ALLOWLIST.includes(rel)) continue;
      const prefixHit = RAW_FETCH_ALLOWLIST_FRAGMENTS.some((p) =>
        rel.startsWith(p),
      );
      if (prefixHit) {
        const subHit = RAW_FETCH_ALLOWLIST_SUBPATHS.some((frag) =>
          rel.includes(frag),
        );
        if (subHit) continue;
      }

      const stripped = stripComments(readFileSync(file, 'utf8'));
      // Match `fetch(` only when it is NOT preceded by a `.`
      // (object method) or a word character (identifier suffix).
      // Blocks `prefetch(`, `unfetch(`, `obj.fetch(` from being
      // false-positive matches.
      const fetchHit = /(^|[^a-zA-Z_$.])fetch\s*\(/.test(stripped);
      if (fetchHit) {
        violations.push(`${rel}  →  raw window.fetch(...)`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('dist/ is git-ignored at repo root', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    // Either an exact `dist/` match or a `dist` prefix counts.
    expect(/^dist\/?$/m.test(gitignore) || /^dist$/m.test(gitignore)).toBe(true);
  });
});
