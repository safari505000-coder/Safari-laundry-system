/**
 * V21 Phase 4 — Realtime canonical-purity tree-wide lock-in.
 *
 * # Why this exists
 *
 * The V20.9 frontend hook `useRealtimeFinancialFeed` is the
 * ONLY approved entry point for SSE-driven cache invalidation.
 * Its unit-test sibling (`v20-9-realtime-feed.test.ts` test 2)
 * already proves the hook never copies payload financials into
 * the canonical cache.
 *
 * This file extends that single-hook proof to the **whole
 * frontend tree**. It asserts at the file-system level that no
 * other code path can reintroduce the bug class:
 *
 *   • No `.tsx`/`.ts` file outside the approved hook
 *     instantiates `EventSource` directly. (Future SSE work
 *     MUST go through the canonical hook.)
 *   • No frontend file reads `envelope.payload.*Kd` fields
 *     from a realtime envelope and pipes them into state.
 *   • No frontend file calls `setQueryData(...)` (the cache
 *     internal mutator) on a key that looks like
 *     `finance:*` — financial cache writes MUST flow from
 *     canonical refetch, never from a UI mutation.
 *
 * Removing or weakening any of these guards fails CI.
 *
 * # Hard rule recap (Phase 4)
 *
 *   "All UI financial values MUST continue flowing from
 *   canonical refetch only."
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB_ROOT = process.cwd().endsWith('web')
  ? process.cwd()
  : join(process.cwd(), 'web');
const SRC_ROOT = join(WEB_ROOT, 'src');

/* ────────────────────────────────────────────────────────────
 * Allowed exceptions — the canonical financial realtime hook,
 * its test, and the two pre-existing operational SSE consumers
 * (driver dispatch + control tower) that pre-date the V20.9
 * financial gateway. These operational consumers do NOT touch
 * `financialCache` — they manage their own per-feature state
 * and are governed by their own tests; they are out of scope
 * for the financial canonical-purity invariant.
 * ──────────────────────────────────────────────────────────── */
const EVENT_SOURCE_ALLOWLIST: ReadonlyArray<string> = [
  'src/modules/finance/state/financial-realtime-feed.ts',
  'src/modules/finance/state/v20-9-realtime-feed.test.ts',
  // Pre-V20.9 operational SSE consumers — out of financial scope.
  'src/modules/call-center/control-tower/hooks/use-control-tower.ts',
  'src/modules/driver/tasks/hooks/use-driver-tasks.ts',
];

const SET_QUERY_DATA_ALLOWLIST: ReadonlyArray<string> = [
  'src/modules/finance/state/financial-cache.ts',
  'src/modules/finance/state/financial-cache.test.ts',
  'src/modules/finance/state/v20-9-realtime-feed.test.ts',
  'src/modules/finance/state/v20-8-state-consolidation.test.ts',
  'src/modules/finance/state/v20-8-performance.test.tsx',
  'src/modules/finance/state/v20-8-no-direct-fetch.test.ts',
  'src/modules/finance/state/financial-mutation.ts',
  'src/modules/finance/state/financial-mutation.test.ts',
  'src/modules/finance/state/financial-realtime.ts',
];

const PAYLOAD_KD_ALLOWLIST: ReadonlyArray<string> = [
  // The realtime feed itself reads `envelope.payload.*` only to
  // pick the prefix to invalidate — never to read a *Kd value.
  // The canonical-purity test in v20-9-realtime-feed.test.ts
  // already enforces this at the unit level.
  'src/modules/finance/state/financial-realtime-feed.ts',
  // Test files exercise the bus shape including a payload with
  // *Kd fields — they assert those values are NOT applied.
  'src/modules/finance/state/v20-9-realtime-feed.test.ts',
  'src/modules/finance/state/v21-phase4-realtime-purity.test.ts',
];

/* ────────────────────────────────────────────────────────────
 * Tiny file walker (avoids globby/glob dep churn).
 * ──────────────────────────────────────────────────────────── */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.vite') continue;
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return relative(WEB_ROOT, p).replace(/\\/g, '/');
}

function stripCommentsAndStrings(src: string): string {
  // Remove block comments, line comments, and string literals so
  // the regex scan does not trigger on documentation or test
  // assertions that quote the patterns.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.|\$\{[^}]*\})*`/g, '``');
}

const ALL_FILES = listFiles(SRC_ROOT);

describe('V21 Phase 4 — realtime canonical-purity tree-wide lock-in', () => {
  test('1. no `.tsx`/`.ts` file outside the approved hook instantiates EventSource directly', () => {
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      const r = rel(f);
      if (EVENT_SOURCE_ALLOWLIST.includes(r)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      if (/\bnew\s+EventSource\s*\(/.test(stripped)) {
        violations.push(`${r}  →  raw new EventSource(...)`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('2. no frontend file reads envelope.payload.*Kd from a realtime envelope', () => {
    // We pattern-match `payload.<word>Kd` (any string ending in
    // 'Kd' — invoiceTotalKd, amountKd, walletBalanceKd, etc.).
    // The allowlist contains the realtime feed file (which only
    // reads `payload.eventName` not `payload.*Kd`), the test files
    // that quote the pattern in assertions, and this file.
    const KD_PAYLOAD = /\bpayload\.[A-Za-z]\w*Kd\b/;
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      const r = rel(f);
      if (PAYLOAD_KD_ALLOWLIST.includes(r)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      if (KD_PAYLOAD.test(stripped)) {
        violations.push(`${r}  →  reads payload.<x>Kd from a realtime envelope`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('3. no frontend file outside the cache module calls financialCache.setQueryData on a finance:* key', () => {
    // Tightens the V20.8 no-direct-fetch guard. setQueryData on
    // financial keys is the ONLY way realtime payload data could
    // poison the canonical cache; we forbid it everywhere except
    // (a) the cache module that defines it, (b) the canonical
    // mutation helper that batches POST→invalidate→prefetch, and
    // (c) the realtime hook test files that exercise the
    // FAKE pre-event seed (allow-listed above).
    const violations: string[] = [];
    for (const f of ALL_FILES) {
      const r = rel(f);
      if (SET_QUERY_DATA_ALLOWLIST.includes(r)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      if (/financialCache\.setQueryData\s*\(/.test(stripped)) {
        violations.push(
          `${r}  →  financialCache.setQueryData(...) — financial cache writes must flow from canonical refetch`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  test('4. canonical realtime hook still uses invalidateFinancial (refetch-on-event invariant)', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'modules/finance/state/financial-realtime-feed.ts'),
      'utf8',
    );
    expect(src).toMatch(/invalidateFinancial\s*\(/);
    expect(src).not.toMatch(/financialCache\.setQueryData\s*\(/);
  });

  test('5. canonical realtime hook documents the no-payload-application contract', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'modules/finance/state/financial-realtime-feed.ts'),
      'utf8',
    );
    // The header comment on the hook explicitly says it NEVER
    // applies the event payload directly to the UI. This test
    // protects the contract docstring so a future refactor
    // cannot quietly drop the documented invariant.
    expect(src).toMatch(/NEVER applies the event payload directly to the UI/);
  });
});
