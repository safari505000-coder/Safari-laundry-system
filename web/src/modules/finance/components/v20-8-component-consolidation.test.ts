/**
 * V20.8 — Phase 3 Component Consolidation static guard.
 *
 * Verifies the V20.7 Financial UI Kit is the single source of
 * truth for newly-written code by rejecting NEW imports of the
 * deprecated cluster:
 *
 *   • `@/modules/shared/components/finance/payment-status-chip`
 *     → use `@/modules/finance/components/PaymentStatusChip`
 *   • `@/modules/call-center/outstanding/components/outstanding-table`
 *     → use `@/modules/finance/components/OutstandingTable`
 *
 * Existing legacy consumers are documented in an explicit
 * grandfathered allow-list. Adding a new entry to the allow-list
 * requires reading the V20.8 LEGACY_DISCOVERY_REPORT first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SCAN_ROOT = 'web/src';
const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);

type Banned = {
  importSubstring: string;
  rationale: string;
  /** Files that legitimately import the deprecated module today. */
  grandfathered: ReadonlySet<string>;
};

const BANNED: ReadonlyArray<Banned> = [
  {
    importSubstring: 'modules/shared/components/finance/payment-status-chip',
    rationale:
      'Deprecated. Use @/modules/finance/components/PaymentStatusChip (V20.7 UI Kit). V23.2 — last consumer (unpaid-invoices-page.tsx) migrated and the legacy file deleted.',
    grandfathered: new Set<string>([]),
  },
  {
    importSubstring: 'modules/call-center/outstanding/components/outstanding-table',
    rationale:
      'Deprecated. Use @/modules/finance/components/OutstandingTable (V20.7 UI Kit).',
    grandfathered: new Set<string>([]),
  },
  {
    importSubstring: 'components/layout/Sidebar',
    rationale:
      'Deprecated. Use @/modules/shared/components/shell/executive-sidebar (V19.x).',
    grandfathered: new Set<string>([]),
  },
  {
    importSubstring: 'components/layout/Header',
    rationale:
      'Deprecated. Use @/modules/shared/components/shell/executive-header (V19.x).',
    grandfathered: new Set<string>([]),
  },
];

function listFiles(root: string): string[] {
  const acc: string[] = [];
  if (!safeStat(root)) return acc;
  for (const entry of readdirSync(root)) {
    const abs = join(root, entry);
    const s = statSync(abs);
    if (s.isDirectory()) {
      // Skip node_modules / dist / .vite caches if any.
      if (entry === 'node_modules' || entry === 'dist' || entry === '.vite') {
        continue;
      }
      acc.push(...listFiles(abs));
    } else {
      const idx = entry.lastIndexOf('.');
      if (idx >= 0 && SCAN_EXTENSIONS.has(entry.slice(idx))) acc.push(abs);
    }
  }
  return acc;
}

/** Strip block comments and line comments so we never flag prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
}

const TEST_FILE_RX = /\.(test|spec)\.tsx?$/;

function safeStat(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

describe('V20.8 — Phase 3 component consolidation', () => {
  // Resolve repo root regardless of which folder vitest is run from.
  const repoRoot = process.cwd().endsWith('web')
    ? join(process.cwd(), '..')
    : process.cwd();
  const scanAbs = join(repoRoot, SCAN_ROOT);

  for (const ban of BANNED) {
    test(`no NEW imports of ${ban.importSubstring}`, () => {
      const files = listFiles(scanAbs);
      const violations: string[] = [];
      for (const file of files) {
        // Tests and spec files contain banned strings as literals;
        // they are not real importers.
        if (TEST_FILE_RX.test(file)) continue;
        const stripped = stripComments(readFileSync(file, 'utf8'));
        if (!stripped.includes(ban.importSubstring)) continue;
        // Reduce to a stable POSIX-style relative path.
        const rel = file
          .replace(repoRoot + '\\', '')
          .replace(repoRoot + '/', '')
          .replace(/\\/g, '/');
        if (ban.grandfathered.has(rel)) continue;
        // Self-imports (the deprecated file itself) are fine.
        if (rel.endsWith(ban.importSubstring + '.tsx') || rel.endsWith(ban.importSubstring + '.ts')) {
          continue;
        }
        violations.push(`${rel} imports deprecated '${ban.importSubstring}'`);
      }
      expect(
        violations,
        `${ban.rationale}\nViolations:\n  ${violations.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
