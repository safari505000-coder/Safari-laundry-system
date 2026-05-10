/**
 * V23.1 Phase 7 — Canonical-purity guard for the Collections Workflow module.
 *
 * Lock-in test that scans the source of every file in
 * `web/src/modules/collections-workflow/` and proves it stays inside
 * the visibility-only operational envelope:
 *
 *   1. NO money math
 *        - no parseFloat / Number.parseFloat
 *        - no Number(...Kd) coercion
 *        - no Math.* called on a *Kd identifier
 *
 *   2. NO direct calls to canonical financial endpoints
 *        - the module may only call /api/collections/workflow/*
 *        - any other path inside an apiJson(...) call is a violation
 *
 *   3. NO React Query mutation hooks (useMutation)
 *        - mutations are owned by the explicit hook + API client,
 *          not embedded in components
 *
 *   4. amountKdSnapshot fields are NEVER passed to a numeric primitive
 *        - rg the source for `Number(...amountKdSnapshot...)` and friends
 */
import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MODULE_ROOT = resolve(__dirname);

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
  return walk(MODULE_ROOT).map((file) => ({ file, src: readFileSync(file, 'utf8') }));
}

describe('V23.1 Phase 7 — collections-workflow stays canonical-pure', () => {
  const sources = listSources();

  test('no parseFloat / Number.parseFloat in the workflow module', () => {
    const offenders: string[] = [];
    for (const { file, src } of sources) {
      if (/\bparseFloat\s*\(/.test(src)) {
        offenders.push(`parseFloat in ${relative(process.cwd(), file)}`);
      }
      if (/Number\.parseFloat\s*\(/.test(src)) {
        offenders.push(`Number.parseFloat in ${relative(process.cwd(), file)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no Number(<*Kd>) coercion of money fields', () => {
    const offenders: string[] = [];
    const re = /\bNumber\s*\(\s*[A-Za-z_][A-Za-z0-9_.$\[\]'"]*Kd\b/;
    for (const { file, src } of sources) {
      if (re.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  test('no Math.* on a *Kd identifier', () => {
    const offenders: string[] = [];
    const re = /\bMath\.[a-zA-Z]+\s*\([^)]*[A-Za-z_][A-Za-z0-9_]*Kd\b/;
    for (const { file, src } of sources) {
      if (re.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  test('no useMutation hook in the workflow module (mutations live in the API client)', () => {
    const offenders: string[] = [];
    for (const { file, src } of sources) {
      if (/\buseMutation\s*\(/.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  test('apiJson() calls only ever hit /api/collections/workflow/*', () => {
    const offenders: string[] = [];
    // Capture the path string passed to apiJson(...) — both single and double quotes,
    // and template literals are inspected. We only allow paths that begin with
    // `/api/collections/workflow`.
    const re = /apiJson(?:<[^>]+>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/g;
    for (const { file, src } of sources) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(src)) !== null) {
        const path = match[1];
        if (!path.startsWith('/api/collections/workflow')) {
          offenders.push(`${relative(process.cwd(), file)} → ${path}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('amountKdSnapshot is never passed into a numeric coercion', () => {
    const offenders: string[] = [];
    // Forbidden patterns: Number(amountKdSnapshot), parseFloat(amountKdSnapshot),
    // +amountKdSnapshot, parseInt(amountKdSnapshot, ...).
    const patterns: RegExp[] = [
      /\bNumber\s*\(\s*[^)]*amountKdSnapshot[^)]*\)/,
      /\bparseFloat\s*\(\s*[^)]*amountKdSnapshot[^)]*\)/,
      /\bparseInt\s*\(\s*[^)]*amountKdSnapshot[^)]*\)/,
      /\+\s*[A-Za-z_][\w.$\[\]'"]*amountKdSnapshot\b/,
    ];
    for (const { file, src } of sources) {
      for (const pat of patterns) {
        if (pat.test(src)) {
          offenders.push(`${relative(process.cwd(), file)} matches ${pat}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
