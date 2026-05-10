import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = process.cwd().endsWith('web') ? join(process.cwd(), '..') : process.cwd();

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const abs = join(root, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(abs));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(abs);
    }
  }
  return out;
}

describe('V22 current debt display guard', () => {
  test('Customer360 unpaid cards use canonical receivable debt, not historical invoice totals', () => {
    const smart = read('web/src/modules/customers/components/Customer360Smart.tsx');
    const panel = read('web/src/modules/call-center/components/customer-360-panel.tsx');
    const overview = read('web/src/modules/call-center/dashboard/components/tabs/overview-tab.tsx');
    const v2 = read('web/src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx');

    // V23.1 Final — every Customer 360 surface MUST read the canonical
    // receivable debt directly. The legacy `breakdown.receivableDebtKd ??
    // totalDueKd` fallback drifted from the Collections cockpit by the
    // amount the wallet/subscription had absorbed (the operator-visible
    // 35.000 د.ك vs. 10.000 د.ك bug). The fallback is now banned and
    // every surface must read `f.canonicalDebtKd` (or `fin.` alias).
    for (const src of [smart, panel, overview, v2]) {
      expect(src).toMatch(/(?:f|fin)\.canonicalDebtKd/);
      // Forbid the legacy fallback chain that allowed totalDueKd to
      // surface when `breakdown` was missing from the payload.
      expect(src).not.toMatch(
        /receivableDebtKd\s*\?\?\s*(?:f|fin)\.totalDueKd/,
      );
      expect(src).not.toMatch(/غير مدفوعة["'}\s,]*value=\{(?:f|fin)\.totalInvoicesKd\}/);
    }

    expect(smart).toMatch(/الفواتير غير مدفوعة[\s\S]{0,120}unpaidInvoicesKd/);
    expect(panel).toMatch(/label="الفواتير غير مدفوعة"\s+value=\{unpaidInvoicesKd\}/);
    expect(overview).toMatch(/defaultValue:\s*'الفواتير غير مدفوعة'[\s\S]{0,180}formatKwdLabel\(unpaidInvoicesKd\)/);
    expect(v2).toMatch(/customer360v2\.stats\.unpaidInvoices[\s\S]{0,180}value=\{unpaidInvoicesKd\}/);
  });

  test('Subscribers page uses remainingDebtKd as the visible and actionable debt', () => {
    const src = read('web/src/pages/subscribers-page.tsx');
    expect(src).toContain('function subscriberRemainingDebtKd');
    expect(src).toContain('r?.remainingDebtKd ??');
    expect(src).toMatch(/formatKwdLabel\(subscriberRemainingDebtKd\(r\)\)/);
    // V23.1 — partial-debt dialog reads debt from `subscriberRemainingDebtKd`
    // and routes it through the canonical KWD helpers (no parseFloat/Number).
    expect(src).toMatch(/debtKdString\s*=\s*subscriberRemainingDebtKd\(subscriber\)/);
    expect(src).not.toMatch(/Number\.parseFloat\(subscriberRemainingDebtKd/);

    expect(src).not.toMatch(/formatKwdLabel\(r\.operationalDebtKd/);
    expect(src).not.toMatch(/formatKwdLabel\([^)]*effectiveDebtKd[^)]*\)/);
  });

  test('Subscriber API type exposes remainingDebtKd from backend projections', () => {
    const src = read('web/src/lib/api.ts');
    const row = src.slice(
      src.indexOf('export type SubscriberListRow = {'),
      src.indexOf('export type CallCenterOperationsSummary'),
    );

    expect(row).toContain('remainingDebtKd?: string');
  });

  test('deprecated effectiveDebtKd is not available to operational frontend code', () => {
    const webSrc = join(repoRoot, 'web/src');
    const offenders = listSourceFiles(webSrc)
      .filter((file) => !file.endsWith('v22-current-debt-display-guard.test.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('effectiveDebtKd'));

    expect(offenders).toEqual([]);
  });

  // V23.2 — `Customer360Financials.totalDueKd` was removed from the
  // wire DTO entirely (V23.1 marked it `@deprecated`, V23.2 deleted
  // it). This guard fails if anyone re-adds the field declaration on
  // either the FE type or the BE DTO. Engine-internal `totalDueKd`
  // (kept for invariant tests inside the math layer) is allowed.
  test('Customer360Financials type no longer declares totalDueKd', () => {
    const apiTs = read('web/src/lib/api.ts');
    const customer360TypeIdx = apiTs.indexOf(
      'export type Customer360Financials',
    );
    expect(customer360TypeIdx).toBeGreaterThan(-1);
    const closingBraceIdx = apiTs.indexOf('};', customer360TypeIdx);
    expect(closingBraceIdx).toBeGreaterThan(customer360TypeIdx);
    const customer360Block = apiTs.slice(customer360TypeIdx, closingBraceIdx);
    // Property declaration shape: `totalDueKd: <type>`.
    expect(customer360Block).not.toMatch(/^\s*totalDueKd\s*[?:]/m);
  });

  test('Customer360FinancialsDto on the backend no longer declares totalDueKd', () => {
    const dto = read('src/customers/customer-360.types.ts');
    const dtoIdx = dto.indexOf('export type Customer360FinancialsDto');
    expect(dtoIdx).toBeGreaterThan(-1);
    const closingBraceIdx = dto.indexOf('};', dtoIdx);
    expect(closingBraceIdx).toBeGreaterThan(dtoIdx);
    const dtoBlock = dto.slice(dtoIdx, closingBraceIdx);
    expect(dtoBlock).not.toMatch(/^\s*totalDueKd\s*[?:]/m);
  });

  // V23.2 — operational frontend code may NEVER read `<x>.totalDueKd`
  // on Customer360 anymore. This guard scans every production .tsx/.ts
  // under web/src/ (excluding tests, this guard, and Outstanding /
  // OwnerDashboard surfaces which use independent canonical fields
  // also named `totalDueKd` on different DTOs). Comments are stripped
  // so the regex never trips on prose that mentions the legacy field.
  test('no production code reads .totalDueKd on a Customer360 financials object', () => {
    const webSrc = join(repoRoot, 'web/src');
    // Outstanding API + Collections Report keep the `totalDueKd` name
    // on a DIFFERENT DTO (`OutstandingResponse` / `OutstandingRow`)
    // which is the canonical Outstanding aggregate, not the legacy
    // Customer360 field. Allowlisted explicitly.
    const ALLOW = new Set(
      [
        'web/src/modules/call-center/outstanding/api/outstanding-api.ts',
        'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
        'web/src/modules/call-center/collections-report/utils/date-presets.ts',
        'web/src/modules/call-center/collections-report/hooks/use-collections-filters.ts',
        'web/src/modules/call-center/dashboard/components/kpi-strip.tsx',
        'web/src/modules/call-center/dashboard/components/call-queue.tsx',
        'web/src/modules/call-center/dashboard/components/customer-panel.tsx',
        'web/src/modules/call-center/dashboard/components/alerts-panel.tsx',
        'web/src/modules/call-center/dashboard/pages/cc-dashboard-page.tsx',
      ].map((p) => p.replace(/\//g, require('node:path').sep)),
    );
    const stripCommentsLocal = (src: string): string =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');
    const offenders = listSourceFiles(webSrc)
      .filter((file) => !/\.(test|spec)\.tsx?$/.test(file))
      .filter((file) => !file.endsWith('v22-current-debt-display-guard.test.ts'))
      .filter((file) => {
        const rel = file.slice(repoRoot.length + 1);
        return !ALLOW.has(rel);
      })
      .filter((file) =>
        /[^A-Za-z_$]totalDueKd\b/.test(stripCommentsLocal(readFileSync(file, 'utf8'))),
      );

    expect(offenders).toEqual([]);
  });
});
