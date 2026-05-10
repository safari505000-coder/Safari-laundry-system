/**
 * V23 Phase 6 — Canonical-purity guard for new operational modules.
 *
 * Lock-in test that scans the source of every NEW V23 module
 * (presence, workflow-intelligence, realtime-observability) and
 * proves they obey the hard rules the phase was scoped under:
 *
 *   1. NO frontend money math:
 *        - no `parseFloat(`
 *        - no `Number.parseFloat(`
 *        - no `Number(` on a "*Kd" identifier
 *
 *   2. NO direct API mutations from visibility-only modules:
 *        - no `apiJson(...{ method: 'POST' })`
 *        - no `apiJson(...{ method: 'PATCH' })`
 *        - no `apiJson(...{ method: 'DELETE' })`
 *      EXCEPTION: `presence-api.ts` legitimately POSTs / DELETEs
 *      its own visibility-only `/api/presence/heartbeat`.
 *
 *   3. NO React Query mutation hooks (`useMutation`).
 *
 * If a future change introduces a violation, this test fails with
 * a precise file + offending line, telling the contributor exactly
 * which invariant they tripped.
 */
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MODULES_TO_GUARD = [
  resolve(__dirname, '..', 'presence'),
  resolve(__dirname, '..', 'workflow-intelligence'),
  resolve(__dirname, '..', 'realtime-observability'),
];

const ALLOW_MUTATION_FILES = new Set([
  // presence-api.ts is the ONLY visibility-only file that uses POST/DELETE
  // because it heartbeats and releases presence. No money is involved.
  resolve(__dirname, '..', 'presence', 'presence-api.ts'),
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function listSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  for (const root of MODULES_TO_GUARD) {
    for (const file of walk(root)) {
      out.push({ file, src: readFileSync(file, 'utf8') });
    }
  }
  return out;
}

describe('V23 Phase 6 — visibility-only modules stay money-free', () => {
  const sources = listSources();

  test('no parseFloat / Number.parseFloat anywhere in the new modules', () => {
    const offenders: string[] = [];
    for (const { file, src } of sources) {
      if (/\bparseFloat\s*\(/.test(src)) offenders.push(`parseFloat in ${relative(process.cwd(), file)}`);
      if (/Number\.parseFloat\s*\(/.test(src)) {
        offenders.push(`Number.parseFloat in ${relative(process.cwd(), file)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no Number(...) call against a *Kd identifier', () => {
    const offenders: string[] = [];
    const re = /\bNumber\s*\(\s*[A-Za-z_][A-Za-z0-9_$]*Kd\b/;
    for (const { file, src } of sources) {
      if (re.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  test('no useMutation hook in any visibility-only module', () => {
    const offenders: string[] = [];
    for (const { file, src } of sources) {
      if (/\buseMutation\s*\(/.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  test('no apiJson(... { method: POST/PATCH/DELETE }) outside the presence-api allowlist', () => {
    const offenders: string[] = [];
    const re = /apiJson[\s\S]{0,200}method:\s*['"](POST|PATCH|DELETE)['"]/;
    for (const { file, src } of sources) {
      if (ALLOW_MUTATION_FILES.has(file)) continue;
      if (re.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });
});
