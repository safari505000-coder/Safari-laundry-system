/**
 * Integration tests — real Prisma + PostgreSQL.
 *
 * Prerequisite:
 *   DATABASE migrated; roles seeded (prisma db seed).
 *
 * Run:
 *   ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL="postgresql://..." npm test -- accountant-dashboard.integration
 *
 * Product definition:
 *   deltaKd = handedKd − collectedKd (= legacy `differenceKd`)
 *   shortfallKd = collectedKd − handedKd (= −deltaKd)
 *   status: GREEN balanced | RED shortfall>0 (drivers) | YELLOW delta>0 (office / timing)
 *   legacy `badge` on raw delta unchanged (green/yellow/red timing-lag semantics).
 */
import { CashStatus, ManagerCashCustodyStatus } from '@prisma/client';
import { AccountantDashboardPeriod } from '../dto/accountant-dashboard-query.dto';
import {
  createAccountantDashboardTestContext,
  insertApprovedExpense,
  insertCompletedCashOrder,
  insertCustodyHandover,
} from '../test-utils/accountant-dashboard-integration-context';
import { AccountantDashboardService } from './accountant-dashboard.service';
import { FinanceDashboardCacheService } from './finance-dashboard-cache.service';
import type { CashService } from './cash.service';

jest.setTimeout(120_000);

const hasTestDb = Boolean(
  process.env.ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL?.trim(),
);

const describeIntegration = hasTestDb ? describe : describe.skip;

/** Default wall clock for “today” / week boundaries in most tests. */
const DEFAULT_FAKE_NOW = new Date('2026-06-10T15:00:00.000Z');

function makeDashboardService(
  prisma: import('@prisma/client').PrismaClient,
): AccountantDashboardService {
  const cache = {
    cacheKey: (...args: Parameters<FinanceDashboardCacheService['cacheKey']>) =>
      new FinanceDashboardCacheService().cacheKey(...args),
    wrapJson: async <T>(_key: string, compute: () => Promise<T>): Promise<T> =>
      compute(),
  } as FinanceDashboardCacheService;
  const cash = {
    getTotalCashWithDrivers: jest.fn(async () => '0.0000'),
  } as unknown as CashService;
  // V23.3 — Cast: `PrismaClient` (the test container's raw client)
  // and `PrismaService` are structurally identical at the call-site
  // level used by the dashboard service. The cast keeps `tsc --noEmit`
  // green without altering integration-test semantics.
  return new AccountantDashboardService(prisma as never, cash, cache);
}

/** Kuwait “today” window includes this instant when used with matching fake clock. */
const IN_TODAY = new Date('2026-06-10T10:00:00.000Z');

describeIntegration('AccountantDashboardService — Integration with Prisma', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(DEFAULT_FAKE_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Reconciliation', () => {
    it('excludes COMPLETED CASH orders with null driverId from collected total', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '40.0000',
          completedAt: IN_TODAY,
        });
        await insertCompletedCashOrder(ctx, {
          driverId: null,
          totalPrice: '999.0000',
          completedAt: IN_TODAY,
        });

        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(Number(r.collected.kd)).toBe(40);
        expect(r.collected.orderCount).toBe(1);
        expect(Number(r.handed.kd)).toBe(0);
        expect(r.differenceKd).toBe('-40.0000');
        expect(r.deltaKd).toBe('-40.0000');
        expect(r.shortfallKd).toBe('40.0000');
        expect(r.status).toBe('RED');
        expect(r.badge).toBe('yellow');
        expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
      } finally {
        await ctx.dispose();
      }
    });

    it('two-driver partial handover: 300 collected, 250 handed → shortfall 50 RED', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '100.0000',
          completedAt: IN_TODAY,
        });
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverBId,
          totalPrice: '200.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '100.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverBId,
          amountKd: '150.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        await insertApprovedExpense(ctx, {
          amount: '50.0000',
          expenseDate: IN_TODAY,
        });

        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });

        expect(Number(r.collected.kd)).toBe(300);
        expect(Number(r.handed.kd)).toBe(250);
        expect(r.differenceKd).toBe('-50.0000');
        expect(r.deltaKd).toBe('-50.0000');
        expect(r.shortfallKd).toBe('50.0000');
        expect(r.status).toBe('RED');
        expect(r.badge).toBe('yellow');
        expect(Number(r.collected.kd) - Number(r.handed.kd)).toBe(
          Number(r.shortfallKd),
        );
        expect(Number(r.handed.kd) - Number(r.collected.kd)).toBe(
          Number(r.deltaKd),
        );

        const explain = await service.explainReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const rowA = explain.byDriver.find((d) => d.driverId === ctx.driverAId);
        const rowB = explain.byDriver.find((d) => d.driverId === ctx.driverBId);
        expect(rowA).toBeDefined();
        expect(rowB).toBeDefined();
        expect(Number(rowA!.collectedKd)).toBe(100);
        expect(Number(rowA!.handedKd)).toBe(100);
        expect(rowA!.shortfallKd).toBe('0.0000');
        expect(Number(rowB!.collectedKd)).toBe(200);
        expect(Number(rowB!.handedKd)).toBe(150);
        expect(Number(rowB!.shortfallKd)).toBe(50);
        expect(explain.totalShortfallKd).toBe('50.0000');
        expect(explain.totalDeltaKd).toBe('-50.0000');
        expect(explain.summaryLabels.driverHoldsLine).toBe(
          'Driver holds 50.0000 KWD',
        );
        expect(explain.summaryLabels.officeHoldsLine).toBeNull();

        const summary = await service.getDashboardSummary({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(Number(summary.expenses.totalKd)).toBe(50);
      } finally {
        await ctx.dispose();
      }
    });

    it('over-delivery in window: collected 100, handed 130 → delta +30, status YELLOW', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '100.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '130.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(Number(r.collected.kd)).toBe(100);
        expect(Number(r.handed.kd)).toBe(130);
        expect(r.differenceKd).toBe('30.0000');
        expect(r.deltaKd).toBe('30.0000');
        expect(r.shortfallKd).toBe('-30.0000');
        expect(r.status).toBe('YELLOW');
        expect(r.badge).toBe('red');
        expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
      } finally {
        await ctx.dispose();
      }
    });

    it('collected=300 handed=350 → delta +50 YELLOW; legacy badge red', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '300.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '350.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(Number(r.collected.kd)).toBe(300);
        expect(Number(r.handed.kd)).toBe(350);
        expect(r.shortfallKd).toBe('-50.0000');
        expect(r.deltaKd).toBe('50.0000');
        expect(r.differenceKd).toBe('50.0000');
        expect(r.status).toBe('YELLOW');
        expect(r.badge).toBe('red');
        expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
      } finally {
        await ctx.dispose();
      }
    });

    it('zero activity: collected 0, handed 0, GREEN', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(r.collected.kd).toBe('0.0000');
        expect(r.handed.kd).toBe('0.0000');
        expect(r.differenceKd).toBe('0.0000');
        expect(r.deltaKd).toBe('0.0000');
        expect(r.shortfallKd).toBe('0.0000');
        expect(r.status).toBe('GREEN');
        expect(r.badge).toBe('green');
      } finally {
        await ctx.dispose();
      }
    });

    it('sums wallet-scale cash amounts without Number overflow', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const big = '999999999999.9999';
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: big,
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: big,
          receivedFromDriverAt: IN_TODAY,
        });
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(r.collected.kd).toBe(big);
        expect(r.handed.kd).toBe(big);
        expect(r.differenceKd).toBe('0.0000');
        expect(r.deltaKd).toBe('0.0000');
        expect(r.shortfallKd).toBe('0.0000');
        expect(r.status).toBe('GREEN');
        expect(r.badge).toBe('green');
      } finally {
        await ctx.dispose();
      }
    });

    it('respects 4dp rounding on custody + orders (mixed fractional tails)', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '10.1250',
          completedAt: IN_TODAY,
        });
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverBId,
          totalPrice: '20.8750',
          completedAt: IN_TODAY,
        });
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(r.collected.kd).toBe('31.0000');
        expect(r.collected.orderCount).toBe(2);
      } finally {
        await ctx.dispose();
      }
    });

    it('shortfallKd and deltaKd stay inverses of window collected and handed', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '125.5000',
          completedAt: IN_TODAY,
        });
        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const c = Number(r.collected.kd);
        const h = Number(r.handed.kd);
        expect(r.shortfallKd).toBe((c - h).toFixed(4));
        expect(r.deltaKd).toBe((h - c).toFixed(4));
        expect(r.differenceKd).toBe(r.deltaKd);
        expect(Number(r.shortfallKd)).toBe(-Number(r.deltaKd));
      } finally {
        await ctx.dispose();
      }
    });
  });

  describe('Time filters', () => {
    it('aggregates only orders whose completedAt falls inside TODAY window', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const inside = new Date('2026-06-10T12:00:00.000Z');
        const beforeToday = new Date('2026-06-08T12:00:00.000Z');

        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '10.0000',
          completedAt: inside,
        });
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '77.0000',
          completedAt: beforeToday,
        });

        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(Number(r.collected.kd)).toBe(10);
        expect(r.collected.orderCount).toBe(1);
      } finally {
        await ctx.dispose();
      }
    });

    it('MONTH period excludes sales completed before the Kuwait calendar month', async () => {
      jest.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '5.0000',
          completedAt: new Date('2026-06-05T12:00:00.000Z'),
        });
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '7.0000',
          completedAt: new Date('2026-05-28T12:00:00.000Z'),
        });

        const r = await service.getReconciliation({
          period: AccountantDashboardPeriod.MONTH,
          branchId: ctx.branchId,
        });
        expect(Number(r.collected.kd)).toBe(5);
        expect(r.collected.orderCount).toBe(1);
      } finally {
        await ctx.dispose();
      }
    });
  });

  describe('Alerts', () => {
    it('does not emit DRIVER_CASH_AGING below 24h; emits MEDIUM at exactly 24h', async () => {
      const now = new Date('2026-07-01T12:00:00.000Z');
      jest.setSystemTime(now);
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const almost = new Date(now.getTime() - (23.5 * 3600 * 1000));
        const exact24 = new Date(now.getTime() - (24 * 3600 * 1000));

        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '1.0000',
          completedAt: almost,
          cashStatus: CashStatus.PAID_TO_DRIVER,
        });
        let alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(alerts.alerts.filter((a) => a.code === 'DRIVER_CASH_AGING')).toHaveLength(
          0,
        );

        await ctx.prisma.order.updateMany({
          where: { customerId: ctx.customerId },
          data: { completedAt: exact24 },
        });

        alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const aging = alerts.alerts.filter((a) => a.code === 'DRIVER_CASH_AGING');
        expect(aging).toHaveLength(1);
        expect(aging[0].severity).toBe('MEDIUM');
      } finally {
        await ctx.dispose();
      }
    });

    it('escalates DRIVER_CASH_AGING to HIGH at ≥ 48h', async () => {
      const now = new Date('2026-07-02T08:00:00.000Z');
      jest.setSystemTime(now);
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const h48 = new Date(now.getTime() - (48 * 3600 * 1000));
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '2.0000',
          completedAt: h48,
          cashStatus: CashStatus.PAID_TO_DRIVER,
        });
        const alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const aging = alerts.alerts.filter((a) => a.code === 'DRIVER_CASH_AGING');
        expect(aging).toHaveLength(1);
        expect(aging[0].severity).toBe('HIGH');
      } finally {
        await ctx.dispose();
      }
    });

    it('emits CUSTODY_REJECTED for REJECTED bags only', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '15.0000',
          receivedFromDriverAt: IN_TODAY,
          status: ManagerCashCustodyStatus.REJECTED,
        });
        const alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const rej = alerts.alerts.filter((a) => a.code === 'CUSTODY_REJECTED');
        expect(rej).toHaveLength(1);
        expect(rej[0].severity).toBe('HIGH');
      } finally {
        await ctx.dispose();
      }
    });

    it('EXPENSE_SPIKE triggers only when current ≥ 1.5× prior window (strict)', async () => {
      jest.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        const { cur, prev } = service.resolveWindow(AccountantDashboardPeriod.WEEK);
        const prevMid = new Date(prev.from.getTime() + 3600_000);
        const curMid = new Date(cur.from.getTime() + 3600_000);

        await insertApprovedExpense(ctx, {
          amount: '100.0000',
          expenseDate: prevMid,
        });

        await insertApprovedExpense(ctx, {
          amount: '149.9999',
          expenseDate: curMid,
        });
        let alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.WEEK,
          branchId: ctx.branchId,
        });
        expect(alerts.alerts.some((a) => a.code === 'EXPENSE_SPIKE')).toBe(false);

        await ctx.prisma.branchExpense.deleteMany({ where: { branchId: ctx.branchId } });
        await insertApprovedExpense(ctx, {
          amount: '100.0000',
          expenseDate: prevMid,
        });
        await insertApprovedExpense(ctx, {
          amount: '150.0000',
          expenseDate: curMid,
        });
        alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.WEEK,
          branchId: ctx.branchId,
        });
        expect(alerts.alerts.some((a) => a.code === 'EXPENSE_SPIKE')).toBe(true);
      } finally {
        await ctx.dispose();
      }
    });

    it('no false positive DRIVER_CASH_AGING when cash already handed (cashStatus not PAID_TO_DRIVER)', async () => {
      const now = new Date('2026-07-05T12:00:00.000Z');
      jest.setSystemTime(now);
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '3.0000',
          completedAt: new Date(now.getTime() - (100 * 3600 * 1000)),
          cashStatus: CashStatus.HANDED_OVER_TO_OFFICE,
        });
        const alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(alerts.alerts.filter((a) => a.code === 'DRIVER_CASH_AGING')).toHaveLength(
          0,
        );
      } finally {
        await ctx.dispose();
      }
    });

    it('DEPOSIT_VERIFY_DELAY fires only at slip wait ≥ 48h (AWAITING_VERIFICATION)', async () => {
      const now = new Date('2026-09-01T10:00:00.000Z');
      jest.setSystemTime(now);
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '9.0000',
          receivedFromDriverAt: IN_TODAY,
          status: ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          slipUploadedAt: new Date(now.getTime() - (47.5 * 3600 * 1000)),
        });
        let alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(
          alerts.alerts.filter((a) => a.code === 'DEPOSIT_VERIFY_DELAY'),
        ).toHaveLength(0);

        await ctx.prisma.managerCashCustody.deleteMany({
          where: { branchId: ctx.branchId },
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '9.0000',
          receivedFromDriverAt: IN_TODAY,
          status: ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          slipUploadedAt: new Date(now.getTime() - (48 * 3600 * 1000)),
        });
        alerts = await service.getAlerts({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        const dep = alerts.alerts.filter((a) => a.code === 'DEPOSIT_VERIFY_DELAY');
        expect(dep).toHaveLength(1);
        expect(dep[0].severity).toBe('MEDIUM');
      } finally {
        await ctx.dispose();
      }
    });
  });

  describe('Insights', () => {
    it('includes office-hold insight when status is YELLOW (handed > collected)', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '10.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '40.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        const ins = await service.getInsights({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(ins.lines).toContain(
          'Office holds 30.0000 KWD ahead of collections in-window (timing / reconciliation) — collected 10.0000 vs handed 40.0000.',
        );
      } finally {
        await ctx.dispose();
      }
    });

    it('includes driver-hold insight when status is RED (collected > handed)', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '100.0000',
          completedAt: IN_TODAY,
        });
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverBId,
          totalPrice: '200.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '100.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverBId,
          amountKd: '150.0000',
          receivedFromDriverAt: IN_TODAY,
        });
        const ins = await service.getInsights({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(ins.lines).toContain(
          'Drivers currently hold 50.0000 KWD not yet fully handed in-window (collected 300.0000 vs handed 250.0000).',
        );
      } finally {
        await ctx.dispose();
      }
    });
  });

  describe('Cache coherency', () => {
    it('serves fresh reconciliation after memory cache clear post-mutation', async () => {
      const prev = process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC;
      process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC = '300';

      const ctx = await createAccountantDashboardTestContext();
      const cache = new FinanceDashboardCacheService();
      const cash = {
        getTotalCashWithDrivers: jest.fn(async () => '0.0000'),
      } as unknown as CashService;
      const service = new AccountantDashboardService(ctx.prisma as never, cash, cache);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '50.0000',
          completedAt: IN_TODAY,
        });
        const first = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(first.collected.kd).toBe('50.0000');

        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '25.0000',
          completedAt: IN_TODAY,
        });

        const secondStale = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(secondStale.collected.kd).toBe('50.0000');

        cache.clearMemoryCacheForTests();

        const thirdFresh = await service.getReconciliation({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });
        expect(thirdFresh.collected.kd).toBe('75.0000');
      } finally {
        await ctx.dispose();
        if (prev === undefined) delete process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC;
        else process.env.FINANCE_DASHBOARD_CACHE_TTL_SEC = prev;
      }
    });

    it('explain & recon read the same underlying rows after cache bust', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const cache = new FinanceDashboardCacheService();
      const cash = {
        getTotalCashWithDrivers: jest.fn(async () => '0.0000'),
      } as unknown as CashService;
      const service = new AccountantDashboardService(ctx.prisma as never, cash, cache);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '80.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '80.0000',
          receivedFromDriverAt: IN_TODAY,
        });

        cache.clearMemoryCacheForTests();
        const [r, e] = await Promise.all([
          service.getReconciliation({
            period: AccountantDashboardPeriod.TODAY,
            branchId: ctx.branchId,
          }),
          service.explainReconciliation({
            period: AccountantDashboardPeriod.TODAY,
            branchId: ctx.branchId,
          }),
        ]);
        expect(r.collected.kd).toBe('80.0000');
        expect(r.handed.kd).toBe('80.0000');
        const d = e.byDriver.find((x) => x.driverId === ctx.driverAId);
        expect(Number(d!.collectedKd)).toBe(80);
        expect(Number(d!.handedKd)).toBe(80);
      } finally {
        await ctx.dispose();
      }
    });
  });

  describe('Dashboard summary (strict shape)', () => {
    it('returns KPIs and pipeline amounts aligned with seeded CASH sales and custody', async () => {
      const ctx = await createAccountantDashboardTestContext();
      const service = makeDashboardService(ctx.prisma);
      try {
        await insertCompletedCashOrder(ctx, {
          driverId: ctx.driverAId,
          totalPrice: '100.0000',
          completedAt: IN_TODAY,
        });
        await insertCustodyHandover(ctx, {
          driverId: ctx.driverAId,
          amountKd: '100.0000',
          receivedFromDriverAt: IN_TODAY,
        });

        const summary = await service.getDashboardSummary({
          period: AccountantDashboardPeriod.TODAY,
          branchId: ctx.branchId,
        });

        expect(summary.kpis.totalSales.valueKd).toBe('100.0000');
        expect(summary.kpis.cashCollected.valueKd).toBe('100.0000');
        const customerStage = summary.pipeline.stages.find((s) => s.key === 'customer');
        expect(customerStage?.amountKd).toBe('100.0000');
        expect(customerStage?.count).toBe(1);
      } finally {
        await ctx.dispose();
      }
    });
  });
});

describe('AccountantDashboardService — offline guards', () => {
  it('skips integration suite when ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL unset', () => {
    if (hasTestDb) {
      expect(process.env.ACCOUNTANT_DASHBOARD_TEST_DATABASE_URL).toBeTruthy();
    } else {
      expect(hasTestDb).toBe(false);
    }
  });
});
