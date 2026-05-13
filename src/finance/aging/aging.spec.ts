/* eslint-disable @typescript-eslint/no-explicit-any */
import { CashStatus, OrderStatus, Prisma } from '@prisma/client';
import { AgingService } from './aging.service';
import {
  AGING_BUCKET_LOWER_BOUND,
  AGING_SEVERITY_RANK,
  RISK_FOR_BUCKET,
  bucketForOverdueDays,
  overdueDaysBetween,
} from './aging.types';

describe('V20.5 — Phase 1 Aging types (pure helpers)', () => {
  it('bucketForOverdueDays maps each window correctly', () => {
    expect(bucketForOverdueDays(0)).toBe('CURRENT');
    expect(bucketForOverdueDays(30)).toBe('CURRENT');
    expect(bucketForOverdueDays(31)).toBe('LATE');
    expect(bucketForOverdueDays(60)).toBe('LATE');
    expect(bucketForOverdueDays(61)).toBe('CRITICAL');
    expect(bucketForOverdueDays(90)).toBe('CRITICAL');
    expect(bucketForOverdueDays(91)).toBe('LEGAL');
    expect(bucketForOverdueDays(365)).toBe('LEGAL');
  });

  it('bucketForOverdueDays defends against malformed input', () => {
    expect(bucketForOverdueDays(-1)).toBe('CURRENT');
    expect(bucketForOverdueDays(NaN)).toBe('CURRENT');
    expect(bucketForOverdueDays(Infinity)).toBe('CURRENT'); // not finite
  });

  it('overdueDaysBetween floors to whole days (banking-day convention)', () => {
    const d0 = new Date('2026-01-01T00:00:00.000Z');
    expect(overdueDaysBetween(d0, new Date('2026-01-01T23:00:00.000Z'))).toBe(0);
    expect(overdueDaysBetween(d0, new Date('2026-01-02T00:00:00.000Z'))).toBe(1);
    expect(overdueDaysBetween(d0, new Date('2026-01-31T00:00:00.000Z'))).toBe(30);
    expect(overdueDaysBetween(d0, new Date('2026-04-02T00:00:00.000Z'))).toBe(91);
  });

  it('overdueDaysBetween returns 0 for future / invalid invoice dates', () => {
    const future = new Date('2099-01-01T00:00:00.000Z');
    expect(overdueDaysBetween(future, new Date('2026-01-01T00:00:00.000Z'))).toBe(0);
    expect(overdueDaysBetween(new Date('invalid'), new Date())).toBe(0);
  });

  it('AGING_BUCKET_LOWER_BOUND and AGING_SEVERITY_RANK stay aligned', () => {
    const buckets = ['CURRENT', 'LATE', 'CRITICAL', 'LEGAL'] as const;
    for (let i = 1; i < buckets.length; i++) {
      expect(AGING_SEVERITY_RANK[buckets[i]]).toBeGreaterThan(
        AGING_SEVERITY_RANK[buckets[i - 1]],
      );
      expect(AGING_BUCKET_LOWER_BOUND[buckets[i]]).toBeGreaterThan(
        AGING_BUCKET_LOWER_BOUND[buckets[i - 1]],
      );
    }
  });

  it('RISK_FOR_BUCKET monotonically escalates', () => {
    expect(RISK_FOR_BUCKET.CURRENT).toBe('LOW');
    expect(RISK_FOR_BUCKET.LATE).toBe('MEDIUM');
    expect(RISK_FOR_BUCKET.CRITICAL).toBe('HIGH');
    expect(RISK_FOR_BUCKET.LEGAL).toBe('CRITICAL');
  });
});

describe('V20.5 — Phase 1 AgingService (mocked Prisma)', () => {
  const asOf = new Date('2026-05-07T12:00:00.000Z');

  // V20.4 — set flags so computeOrderRemainingBalancesBatch uses journal path.
  let prevFlag: string | undefined;
  beforeAll(() => {
    prevFlag = process.env.V20_4_FINAL_LEDGER;
    process.env.V20_4_FINAL_LEDGER = 'true';
  });
  afterAll(() => {
    if (prevFlag === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlag;
  });

  /**
   * Build a Prisma mock that handles BOTH `findMany` patterns:
   *
   *   1. AgingService.listInvoiceAging: select id/invoiceNumber/
   *      customerId/createdAt/customer.displayName.
   *   2. computeOrderRemainingBalancesBatch (helper): select id/
   *      totalPrice/status. The helper then loads DebtLedgerEntry
   *      and journal lines to compute remaining; we short-circuit
   *      that path by returning a totalPrice equal to the desired
   *      remaining and zero settlement rows.
   *
   * This keeps the test independent of any helper internals
   * — it only depends on the public Prisma surface.
   */
  function makePrisma(
    orders: Array<{
      id: string;
      invoiceNumber?: string | null;
      customerId: string;
      customerName?: string | null;
      createdAt: Date;
      remaining: string;
      cancelled?: boolean;
    }>,
  ) {
    return {
      order: {
        findMany: jest.fn().mockImplementation((args: any) => {
          // Helper path — `select` includes totalPrice + status.
          if (args?.select?.totalPrice && args?.select?.status) {
            const ids: string[] = args?.where?.id?.in ?? orders.map((o) => o.id);
            return Promise.resolve(
              orders
                .filter((o) => ids.includes(o.id))
                .map((o) => ({
                  id: o.id,
                  totalPrice: new Prisma.Decimal(o.remaining),
                  status: o.cancelled
                    ? OrderStatus.CANCELED
                    : OrderStatus.COMPLETED,
                })),
            );
          }
          // Aging service path — full select with customer relation.
          return Promise.resolve(
            orders
              .filter((o) => !o.cancelled)
              .map((o) => ({
                id: o.id,
                invoiceNumber: o.invoiceNumber ?? null,
                customerId: o.customerId,
                createdAt: o.createdAt,
                customer: { displayName: o.customerName ?? null },
                status: OrderStatus.COMPLETED,
                cashStatus: CashStatus.UNPAID,
              })),
          );
        }),
      },
      // V20.4 — Journal path: return DR entries matching each order's remaining
      // so computeOrderRemainingBalancesBatch returns the expected remaining amount.
      journalLine: {
        findMany: jest.fn().mockImplementation((args: any) => {
          const orderIds: string[] = args?.where?.entry?.orderId?.in ?? [];
          if (orderIds.length > 0) {
            return Promise.resolve(
              orders
                .filter((o) => orderIds.includes(o.id) && !o.cancelled)
                .map((o) => ({
                  debit: new Prisma.Decimal(o.remaining),
                  credit: new Prisma.Decimal(0),
                  entry: { orderId: o.id },
                  customerId: o.customerId ?? null,
                })),
            );
          }
          return Promise.resolve([]);
        }),
      },
    } as any;
  }

  it('listInvoiceAging classifies invoices into the right buckets', async () => {
    const prisma = makePrisma([
      {
        id: 'ord-current',
        customerId: 'cust-A',
        customerName: 'A',
        createdAt: new Date('2026-04-25T00:00:00.000Z'), // 12 days
        remaining: '10',
      },
      {
        id: 'ord-late',
        customerId: 'cust-B',
        customerName: 'B',
        createdAt: new Date('2026-03-20T00:00:00.000Z'), // 48 days
        remaining: '20',
      },
      {
        id: 'ord-critical',
        customerId: 'cust-B',
        customerName: 'B',
        createdAt: new Date('2026-02-20T00:00:00.000Z'), // 76 days
        remaining: '30',
      },
      {
        id: 'ord-legal',
        customerId: 'cust-C',
        customerName: 'C',
        createdAt: new Date('2025-12-01T00:00:00.000Z'), // > 90 days
        remaining: '40',
      },
    ]);
    const svc = new AgingService(prisma);

    const rows = await svc.listInvoiceAging({ asOf });

    expect(rows).toHaveLength(4);
    const byBucket = Object.fromEntries(
      rows.map((r) => [r.invoiceId, r.agingBucket]),
    );
    expect(byBucket['ord-current']).toBe('CURRENT');
    expect(byBucket['ord-late']).toBe('LATE');
    expect(byBucket['ord-critical']).toBe('CRITICAL');
    expect(byBucket['ord-legal']).toBe('LEGAL');
    expect(rows[0].invoiceId).toBe('ord-legal'); // sorted DESC
  });

  it('listCustomerAging takes MAX(bucket) per customer', async () => {
    const prisma = makePrisma([
      {
        id: 'ord-old',
        customerId: 'cust-X',
        customerName: 'X',
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
        remaining: '100',
      },
      {
        id: 'ord-new',
        customerId: 'cust-X',
        customerName: 'X',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        remaining: '5',
      },
    ]);
    const svc = new AgingService(prisma);

    const rows = await svc.listCustomerAging({ asOf });

    expect(rows).toHaveLength(1);
    expect(rows[0].agingBucket).toBe('LEGAL');
    expect(rows[0].riskLevel).toBe('CRITICAL');
    expect(rows[0].totalReceivableKd).toBe('105.0000');
    expect(rows[0].openInvoiceCount).toBe(2);
  });

  it('getReport produces banking-grade portfolio totals', async () => {
    const prisma = makePrisma([
      { id: 'o1', customerId: 'A', createdAt: new Date('2026-04-25T00:00:00.000Z'), remaining: '10' },
      { id: 'o2', customerId: 'B', createdAt: new Date('2026-03-20T00:00:00.000Z'), remaining: '20' },
      { id: 'o3', customerId: 'B', createdAt: new Date('2026-02-20T00:00:00.000Z'), remaining: '30' },
      { id: 'o4', customerId: 'C', createdAt: new Date('2025-12-01T00:00:00.000Z'), remaining: '40' },
    ]);
    const svc = new AgingService(prisma);

    const report = await svc.getReport({ asOf });

    expect(report.invoicesCount).toBe(4);
    expect(report.customersCount).toBe(3);
    expect(report.totalReceivableKd).toBe('100.0000');
    expect(report.criticalReceivableKd).toBe('70.0000');
    const map = Object.fromEntries(report.bucketTotals.map((b) => [b.bucket, b]));
    expect(map.CURRENT.invoicesCount).toBe(1);
    expect(map.LATE.invoicesCount).toBe(1);
    expect(map.CRITICAL.invoicesCount).toBe(1);
    expect(map.LEGAL.invoicesCount).toBe(1);
  });

  it('getCustomerAging returns null for customer with no open AR', async () => {
    const prisma = makePrisma([]);
    const svc = new AgingService(prisma);

    const out = await svc.getCustomerAging('cust-Z', asOf);

    expect(out).toBeNull();
  });
});
