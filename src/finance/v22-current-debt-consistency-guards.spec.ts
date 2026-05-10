import { existsSync, readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

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

describe('V22 current-debt consistency guards', () => {
  it('subscription activation emits a snapshot invalidation event after commit', () => {
    const src = read('src/call-center/call-center.service.ts');
    const activation = src.slice(
      src.indexOf('async activateSubscription('),
      src.indexOf('/**', src.indexOf('async cancelActiveSubscription(')),
    );

    expect(activation).toContain("emitFinancialEvent('finance.subscription.activated'");
    expect(activation).toContain('correlationId: core.settlement.subscriptionId');
    expect(activation).toContain('planId: core.plan.id');
    expect(activation).toContain('expiresAt: walletFinal.subscriptionExpiresAt');

    const txEnd = activation.indexOf(');', activation.indexOf('this.prisma.$transaction'));
    const eventAt = activation.indexOf("emitFinancialEvent('finance.subscription.activated'");
    expect(eventAt).toBeGreaterThan(txEnd);
  });

  it('collections list filters and displays invoices by remaining balance, not gross total', () => {
    const src = read('src/orders/orders.service.ts');
    const method = src.slice(
      src.indexOf('async listUnpaidCollectionOrders('),
      src.indexOf('async listUnpaidCollectionOrdersReport('),
    );

    expect(method).toContain('computeOrderRemainingBalancesBatch');
    expect(method).toContain('remaining.lessThanOrEqualTo(tol)');
    expect(method).toContain('return false');
    expect(method).toContain("amountKd: (remainingByOrder.get(r.id) ?? r.totalPrice).toFixed(3)");
    expect(method).not.toContain('UNPAID rows are always kept');
    expect(method).not.toContain('amountKd: r.totalPrice.toFixed(3)');
  });

  it('call-center red KPI uses remaining debt, not gross invoice totals', () => {
    const src = read('src/call-center/call-center.service.ts');
    const method = src.slice(
      src.indexOf('async getOperationsSummary('),
      src.indexOf('Dastur §5 — Owner Debt Recovery Report'),
    );

    expect(method).toContain('sumCollectionsDebtRemainingKd');
    expect(method).not.toContain('sumCollectionsDebtTotalKd');
  });

  it('V25 exposes pending hosted-link amount from the server summary', () => {
    const dto = read('src/call-center/dto/operations-summary.dto.ts');
    const api = read('web/src/lib/api.ts');
    const service = read('src/call-center/call-center.service.ts');
    const cockpit = read(
      'web/src/modules/call-center/pages/collections-cockpit-page.tsx',
    );

    expect(dto).toContain('pendingLinksKd!: string');
    expect(dto).toContain('linkCollectedTodayKd!: string');
    expect(api).toContain('pendingLinksKd: string');
    expect(api).toContain('linkCollectedTodayKd: string');
    expect(service).toContain('_sum: { totalPrice: true }');
    expect(service).toContain('linkCollectedToday = linkCollectedToday.plus');
    expect(service).toContain('pendingLinksKd: KWD_DP(');
    expect(cockpit).toContain('summaryData.pendingLinksKd');
    expect(cockpit).toContain('summaryData.linkCollectedTodayKd');
  });

  it('deprecated effectiveDebtKd does not reappear in runtime source', () => {
    const roots = [join(repoRoot, 'src'), join(repoRoot, 'web/src')];
    const offenders = roots
      .flatMap((root) => listSourceFiles(root))
      .filter((file) => !file.endsWith('v22-current-debt-consistency-guards.spec.ts'))
      .filter((file) => !file.endsWith('v22-current-debt-display-guard.test.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('effectiveDebtKd'));

    expect(offenders).toEqual([]);
  });

  it('retired legacy debt surfaces stay deleted', () => {
    expect(existsSync(join(repoRoot, 'src/legacy'))).toBe(false);

    const orders = read('src/orders/orders.service.ts');
    expect(orders).not.toContain('legacyDoubleCountMode');
    expect(orders).not.toContain('OPERATIONAL_DEBT_LEGACY_DOUBLE_COUNT');
    expect(orders).not.toContain('getEffectiveDebtKdBreakdown');
    expect(orders).not.toContain('listUnpaidOnlinePaymentOrders');
  });
});
