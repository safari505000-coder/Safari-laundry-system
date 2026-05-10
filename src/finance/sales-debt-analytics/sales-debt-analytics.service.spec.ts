/* eslint-disable @typescript-eslint/no-explicit-any */
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import { SalesDebtAnalyticsService } from './sales-debt-analytics.service';

/**
 * V24 — Wave B sales-debt analytics service unit tests.
 *
 * The service is deterministic and pure aggregation over a Prisma
 * orders query. We mock the Prisma client to feed a fixed orders
 * fixture and assert the canonical KWD strings + insight badges.
 */
describe('SalesDebtAnalyticsService (V24 Wave B)', () => {
  type FixtureOrder = {
    id: string;
    totalPrice: string;
    cashStatus: CashStatus;
    posPaymentMethod: string | null;
    driver: {
      id: string | null;
      fullName: string | null;
      username: string | null;
      branch: { id: string; name: string } | null;
    } | null;
  };

  function makePrisma(orders: FixtureOrder[]) {
    return {
      order: {
        findMany: jest.fn().mockResolvedValue(
          orders.map((o) => ({
            ...o,
            totalPrice: new Prisma.Decimal(o.totalPrice),
          })),
        ),
      },
    } as any;
  }

  const FROM = '2026-01-01T00:00:00.000Z';
  const TO = '2026-01-31T23:59:59.999Z';

  it('returns empty report when no orders match the period', async () => {
    const svc = new SalesDebtAnalyticsService(makePrisma([]));
    const out = await svc.getAnalytics(FROM, TO);

    expect(out.source).toBe('api/finance/sales-debt-analytics');
    expect(out.totals).toEqual({
      totalSalesKd: '0.0000',
      totalCollectedKd: '0.0000',
      totalDebtKd: '0.0000',
      collectionRateBps: 0,
      invoiceCount: 0,
    });
    expect(out.byBranch).toEqual([]);
    expect(out.byDriver).toEqual([]);
    expect(out.insights).toEqual([]);
  });

  it('aggregates settled vs unsettled invoices into canonical 4dp totals', async () => {
    const svc = new SalesDebtAnalyticsService(
      makePrisma([
        {
          id: 'o1',
          totalPrice: '100.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: null,
          driver: {
            id: 'd1',
            fullName: 'سائق ١',
            username: 'driver1',
            branch: { id: 'b1', name: 'فرع ١' },
          },
        },
        {
          id: 'o2',
          totalPrice: '40.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: null,
          driver: {
            id: 'd1',
            fullName: 'سائق ١',
            username: 'driver1',
            branch: { id: 'b1', name: 'فرع ١' },
          },
        },
        {
          id: 'o3',
          totalPrice: '60.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: 'SUBSCRIPTION_WALLET',
          driver: {
            id: 'd2',
            fullName: 'سائق ٢',
            username: 'driver2',
            branch: { id: 'b2', name: 'فرع ٢' },
          },
        },
      ]),
    );

    const out = await svc.getAnalytics(FROM, TO);

    expect(out.totals.totalSalesKd).toBe('200.0000');
    expect(out.totals.totalCollectedKd).toBe('160.0000'); // 100 + 60 (subscription wallet counts settled)
    expect(out.totals.totalDebtKd).toBe('40.0000');
    expect(out.totals.invoiceCount).toBe(3);
    expect(out.totals.collectionRateBps).toBe(8000); // 160/200 = 80% = 8000bps

    // Branch grouping
    const b1 = out.byBranch.find((g) => g.id === 'b1');
    expect(b1).toBeDefined();
    expect(b1?.totalSalesKd).toBe('140.0000');
    expect(b1?.totalCollectedKd).toBe('100.0000');
    expect(b1?.totalDebtKd).toBe('40.0000');
    expect(b1?.invoiceCount).toBe(2);

    const b2 = out.byBranch.find((g) => g.id === 'b2');
    expect(b2?.totalSalesKd).toBe('60.0000');
    expect(b2?.totalCollectedKd).toBe('60.0000');
    expect(b2?.collectionRateBps).toBe(10000);
  });

  it('falls back to "no-branch" / "no-driver" sentinels when relations missing', async () => {
    const svc = new SalesDebtAnalyticsService(
      makePrisma([
        {
          id: 'o-orphan',
          totalPrice: '10.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: null,
          driver: null,
        },
      ]),
    );

    const out = await svc.getAnalytics(FROM, TO);
    expect(out.byBranch[0]?.id).toBe('no-branch');
    expect(out.byBranch[0]?.name).toBe('بدون فرع');
    expect(out.byDriver[0]?.id).toBe('no-driver');
    expect(out.byDriver[0]?.name).toBe('بدون سائق');
  });

  it('emits a low-collection insight when rate < 70%', async () => {
    const svc = new SalesDebtAnalyticsService(
      makePrisma([
        {
          id: 'o1',
          totalPrice: '100.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: null,
          driver: {
            id: 'd1',
            fullName: 'driver',
            username: 'driver',
            branch: { id: 'b1', name: 'b1' },
          },
        },
        {
          id: 'o2',
          totalPrice: '10.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: null,
          driver: {
            id: 'd1',
            fullName: 'driver',
            username: 'driver',
            branch: { id: 'b1', name: 'b1' },
          },
        },
      ]),
    );

    const out = await svc.getAnalytics(FROM, TO);
    const lowCollection = out.insights.find((i) => i.id === 'low-collection');
    expect(lowCollection).toBeDefined();
    expect(lowCollection?.severity).toBe('critical'); // 10/110 = 9% < 45%
  });

  it('emits healthy insight when no badges trigger', async () => {
    const svc = new SalesDebtAnalyticsService(
      makePrisma([
        {
          id: 'o1',
          totalPrice: '100.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: null,
          driver: {
            id: 'd1',
            fullName: 'driver',
            username: 'driver',
            branch: { id: 'b1', name: 'b1' },
          },
        },
      ]),
    );

    const out = await svc.getAnalytics(FROM, TO);
    expect(out.insights.find((i) => i.id === 'healthy')).toBeDefined();
  });

  it('applies banker-rounded basis points (collection rate stays integer wire-safe)', async () => {
    const svc = new SalesDebtAnalyticsService(
      makePrisma([
        // 1 / 3 settled = 33.33...% → 3333 bps after banker rounding
        {
          id: 'o1',
          totalPrice: '1.0000',
          cashStatus: CashStatus.PAID_TO_DRIVER,
          posPaymentMethod: null,
          driver: { id: 'd1', fullName: 'd1', username: 'd1', branch: { id: 'b1', name: 'b1' } },
        },
        {
          id: 'o2',
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: null,
          driver: { id: 'd1', fullName: 'd1', username: 'd1', branch: { id: 'b1', name: 'b1' } },
        },
        {
          id: 'o3',
          totalPrice: '1.0000',
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: null,
          driver: { id: 'd1', fullName: 'd1', username: 'd1', branch: { id: 'b1', name: 'b1' } },
        },
      ]),
    );

    const out = await svc.getAnalytics(FROM, TO);
    expect(out.totals.collectionRateBps).toBe(3333);
  });

  it('skips CANCELED orders (Prisma where filters them out)', async () => {
    const prisma = makePrisma([]);
    const svc = new SalesDebtAnalyticsService(prisma);
    await svc.getAnalytics(FROM, TO);
    const where = (prisma.order.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toEqual({ not: OrderStatus.CANCELED });
  });
});
