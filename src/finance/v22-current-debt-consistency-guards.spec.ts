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

  it('collections list filters by invoice remaining but displays banking-core capped debt', () => {
    const src = read('src/orders/orders.service.ts');
    const method = src.slice(
      src.indexOf('async listUnpaidCollectionOrders('),
      src.indexOf('async listUnpaidCollectionOrdersReport('),
    );

    expect(method).toContain('computeOrderRemainingBalancesBatch');
    expect(method).toContain('remaining.lessThanOrEqualTo(tol)');
    expect(method).toContain('return false');
    expect(method).toContain('debtVisibility.getCustomerVisibleDebtBatch');
    expect(method).toContain('displayRemaining.toFixed(3)');
    expect(method).not.toContain("amountKd: (remainingByOrder.get(r.id) ?? r.totalPrice).toFixed(3)");
    expect(method).not.toContain('UNPAID rows are always kept');
    expect(method).not.toContain('amountKd: r.totalPrice.toFixed(3)');
  });

  it('call-center red KPI uses banking-core visibility, not local order sums', () => {
    const src = read('src/call-center/call-center.service.ts');
    const method = src.slice(
      src.indexOf('async getOperationsSummary('),
      src.indexOf('Dastur §5 — Owner Debt Recovery Report'),
    );

    expect(method).toContain('debtVisibility.getCollectionsSnapshot()');
    expect(method).toContain('collectionsSnapshot.totalRemainingDebtKd');
    expect(method).not.toContain('sumCollectionsDebtRemainingKd');
    expect(method).not.toContain('sumCollectionsDebtTotalKd');
  });

  it('outstanding report headline and rows use banking-core visibility', () => {
    const src = read('src/finance/outstanding/outstanding.service.ts');
    expect(src).toContain('DebtVisibilityService');
    expect(src).toContain('debtVisibility.getCollectionsSnapshot()');
    expect(src).toContain('debtVisibility.getCustomerVisibleDebtBatch(customerIds)');
    expect(src).not.toContain('sumCollectionsDebtTotalKd(');
    expect(src).not.toContain('sumCollectionsDebtRemainingKd(');
  });

  it('Customer 360 reads visible debt from the banking core facade', () => {
    const src = read('src/customers/customer-360.service.ts');
    expect(src).toContain('DebtVisibilityService');
    expect(src).toContain('debtVisibility.getCustomerVisibleDebt(customerId)');
    expect(src).toContain('financials.canonicalDebtKd = visibleDebt.remainingDebtKd');
  });

  it('automatic customer blocking computes debt with a Journal AR reader when available', () => {
    const service = read('src/common/services/customer-blocking.service.ts');
    const customersModule = read('src/customers/customers.module.ts');
    const posModule = read('src/pos/pos.module.ts');

    expect(service).toContain('JournalSourceService');
    expect(service).toContain('this.journalSource ?? null');
    expect(customersModule).toContain('GeneralLedgerModule');
    expect(posModule).toContain('GeneralLedgerModule');
  });

  it('customer ledger header and statement WhatsApp use banking-core visible debt', () => {
    const src = read('src/call-center/call-center.service.ts');
    const method = src.slice(
      src.indexOf('async getCustomerLedger('),
      src.indexOf('async createStatementShareLink('),
    );

    expect(method).toContain('debtVisibility.getCustomerVisibleDebt(customerId)');
    expect(method).toContain('visibleDebt.remainingDebtKd');
    expect(method).toContain('remainingDebtKd: FOUR_DP(statementRemainingDebtKd)');
    expect(method).not.toContain(
      'statementRemainingDebtKd = new Prisma.Decimal(\n      statementInvoiceTotals.totalOpenInvoicesKd',
    );
  });

  it('DebtVisibility overlays live Journal AR over snapshot money for displayed debt', () => {
    const src = read('src/finance/debt-visibility/debt-visibility.service.ts');
    expect(src).toContain('overlayLiveJournalDebt');
    expect(src).toContain('journalSource.getCustomerDebtFromJournalAR');
    expect(src).toContain('remainingDebtKd,');
    expect(src).toContain("canonicalSource: 'JOURNAL_AR'");
  });

  it('collections read model does not display raw FinancialSnapshot remainingDebtKd', () => {
    const src = read('src/read-models/collections-read-model/collections-read-model.service.ts');
    expect(src).toContain('visibility.getCustomerVisibleDebtBatch');
    expect(src).toContain("account: { code: '1300' }");
    expect(src).not.toContain('remainingDebtKd.toFixed(4)');
    expect(src).not.toContain("orderBy: [{ remainingDebtKd: 'desc' }");
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

  it('V25 pending debts without links stay backend-authoritative', () => {
    const financeController = read('src/finance/finance.controller.ts');
    const financeService = read('src/finance/finance.service.ts');
    const debtService = read('src/finance/services/debt.service.ts');
    const reportPage = read(
      'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
    );

    expect(financeController).toContain(
      "@Get('outstanding-debts-without-links')",
    );
    expect(financeService).toContain('getOutstandingDebtsWithoutLinks');
    expect(debtService).toContain('getOutstandingDebtsWithoutLinks');
    expect(debtService).toContain('computeOrderRemainingBalancesBatch');
    expect(debtService).toContain('remaining.toFixed(4)'); // V25 P0 fix: 3dp→4dp canonical KWD
    expect(debtService).toContain('settlementStatus');
    expect(reportPage).toContain('المديونيات المعلّقة للتحصيل');
    expect(reportPage).toContain('formatKwd(row.totalDebt)');
    expect(reportPage).toContain('الأصلي:');
    expect(reportPage).toContain('remainingBalanceKd');
    expect(reportPage).not.toContain('Number.parseFloat(row.totalDebt)');
    expect(reportPage).not.toContain('parseFloat(row.totalDebt)');
  });

  it('V25 multi-invoice settlement link stays backend-authoritative', () => {
    const financeController = read('src/finance/finance.controller.ts');
    const financeService = read('src/finance/finance.service.ts');
    const debtService = read('src/finance/services/debt.service.ts');
    const reportPage = read(
      'web/src/modules/call-center/collections-report/pages/collections-report-page.tsx',
    );

    expect(financeController).toContain("@Post('generate-settlement-link')");
    expect(financeService).toContain('generateSettlementLink(');
    expect(debtService).toContain('async generateSettlementLink(');
    expect(debtService).toContain('totalAmount.toFixed(4)'); // V25 P0 fix: 3dp→4dp canonical KWD
    expect(debtService).toContain(
      'All selected invoiceIds must belong to the provided customerId',
    );
    expect(reportPage).toContain('sumKwdStringsPrecise');
    expect(reportPage).toContain('الإجمالي المحدد');
    expect(reportPage).toContain('/api/finance/generate-settlement-link');
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
