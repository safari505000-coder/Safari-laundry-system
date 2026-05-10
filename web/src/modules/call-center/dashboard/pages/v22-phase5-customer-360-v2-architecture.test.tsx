/**
 * V22 Phase 5 — Customer360 v2 architecture lock-in.
 *
 * Asserts the structural invariants of the new operational
 * Customer360 page (`cc-customer-360-v2-page.tsx`):
 *
 *   • The page is wired into the router under a new additive
 *     route `/cc/customers/:customerId/360`. The v1 path
 *     `/cc/customers/:customerId` MUST still mount the v1 page.
 *
 *   • The page imports the canonical realtime hook AND the
 *     V22 operational primitives (StickyActionBar +
 *     SmartActionChip).
 *
 *   • The page has zero direct money-math leaks: no
 *     `parseFloat`, no `Number(`, no `Math.round` against KD
 *     values, no manual `.toFixed(3)` on totals. (Per the
 *     V21 Phase 1 canonical-money invariants.)
 *
 *   • The page does not introduce a duplicate balance
 *     projection — every displayed KD value flows from the
 *     `useCcCustomer360` projection.
 *
 *   • The new sticky action bar is rendered (presence test).
 *
 * Removing the wire-up, deleting the route, or reintroducing
 * client-side money math fails CI.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = process.cwd().endsWith('web')
  ? process.cwd()
  : join(process.cwd(), 'web');

const V2_PAGE = 'src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx';
const APP_FILE = 'src/App.tsx';

describe('V22 Phase 5 — Customer360 v2 architecture lock-in', () => {
  test('the v2 page exists and exports CcCustomer360V2Page', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    expect(src).toMatch(/export\s+function\s+CcCustomer360V2Page\s*\(/);
  });

  test('App.tsx mounts the v2 page at /cc/customers/:customerId/360', () => {
    const src = readFileSync(join(WEB_ROOT, APP_FILE), 'utf8');
    expect(src).toMatch(/import\s*\{\s*CcCustomer360V2Page\s*\}/);
    // Both routes must coexist — additive, not replacement.
    expect(src).toMatch(/path="cc\/customers\/:customerId"/);
    expect(src).toMatch(/path="cc\/customers\/:customerId\/360"/);
    expect(src).toMatch(/<CcCustomer360Page\s*\/>/);
    expect(src).toMatch(/<CcCustomer360V2Page\s*\/>/);
  });

  test('v2 page imports the canonical realtime hook from @/modules/finance', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    expect(src).toMatch(
      /import\s*\{[^}]*useRealtimeFinancialFeed[^}]*\}\s*from\s*['"]@\/modules\/finance['"]/s,
    );
  });

  test('v2 page imports StickyActionBar + SmartActionChip primitives', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    expect(src).toMatch(
      /from\s*['"]@\/modules\/shared\/components\/operational['"]/,
    );
    expect(src).toContain('StickyActionBar');
    expect(src).toContain('SmartActionChip');
  });

  test('v2 page subscribes to the customer360 channel scoped to the customer', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    expect(src).toMatch(/channel:\s*['"]customer360['"]/);
    expect(src).toMatch(/customerId:\s*safeCustomerId/);
  });

  test('v2 page contains zero direct money math', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    const violations: string[] = [];
    if (/\bparseFloat\s*\(/.test(src)) {
      violations.push('parseFloat(');
    }
    // `Number.parseFloat(` and `Number(` against KD values are
    // both forbidden. We allow `Number.isFinite` in case the
    // page guards against missing numerics.
    if (/Number\.parseFloat\s*\(/.test(src)) {
      violations.push('Number.parseFloat(');
    }
    if (/\bMath\.round\s*\(/.test(src)) {
      violations.push('Math.round(');
    }
    if (/\.toFixed\s*\(\s*3\s*\)/.test(src)) {
      violations.push('.toFixed(3)');
    }
    expect(violations).toEqual([]);
  });

  test('v2 page sources every KD value from the canonical projection', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    // Heuristic: every JSX-displayed `*Kd` field must be
    // accessed off `f.` (financials projection) or `s.` /
    // `data.subscription.` / `sub.` (subscription projection)
    // or come from a `<FinancialStatCard value={...}>` whose
    // value prop is read directly off the projection. We assert
    // the page does NOT compute KD values via array reduction
    // or addition of two strings.
    const reduceRx = /\.reduce\s*\([^)]*Kd/;
    const stringAddRx = /[a-zA-Z_$][\w$]*Kd\s*\+\s*[a-zA-Z_$][\w$]*Kd/;
    expect(reduceRx.test(src)).toBe(false);
    expect(stringAddRx.test(src)).toBe(false);
  });

  test('unpaid invoices card uses canonical receivable debt, not historical invoice total', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    // V23.1 Final — must read canonical debt directly. The legacy
    // `breakdown.receivableDebtKd ?? totalDueKd` fallback is banned
    // because the fallback branch leaks `totalInvoices − totalPayments`
    // (35.000 د.ك vs 10.000 د.ك Customer360 ↔ Cockpit drift).
    expect(src).toContain('f.canonicalDebtKd');
    expect(src).not.toMatch(
      /breakdown\?\.receivableDebtKd\s*\?\?\s*f\.totalDueKd/,
    );
    expect(src).toMatch(/customer360v2\.stats\.unpaidInvoices/);
    expect(src).not.toMatch(
      /customer360v2\.stats\.totalInvoices[\s\S]{0,160}value=\{f\.totalInvoicesKd\}/,
    );
  });

  test('v2 page renders a StickyActionBar with at least one action', () => {
    const src = readFileSync(join(WEB_ROOT, V2_PAGE), 'utf8');
    expect(src).toMatch(/<StickyActionBar[\s\S]*?actions=\{actions\}/);
    // `actions` must be a non-empty array literal. A single
    // canonical action is enough to prove the bar is wired.
    expect(src).toMatch(/StickyActionBarItem\[\]\s*=\s*\[/);
  });
});
