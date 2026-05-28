import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AuditStatus,
  CustomerCollectionStatusKind,
  Prisma,
} from '@prisma/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OutstandingService } from './outstanding.service';

type PrismaMock = ReturnType<typeof buildPrisma>;
type AuditMock = ReturnType<typeof buildAudit>;
type OrdersMock = ReturnType<typeof buildOrders>;
type DebtVisibilityMock = ReturnType<typeof buildDebtVisibility>;

const CUSTOMER_A = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_B = '22222222-2222-4222-8222-222222222222';
const DRIVER_X = '33333333-3333-4333-8333-333333333333';

function buildPrisma() {
  const prisma = {
    customer: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    customerCollectionStatus: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    // V20.3.1 — `OutstandingService.listOutstanding` now batches
    // per-order remaining-balance reads through the canonical
    // helper, which calls `order.findMany` + `debtLedgerEntry.findMany`.
    // Default to empty rows so existing tests continue to assert
    // the legacy `totalDueKd` (gross) without computing remaining.
    order: { findMany: jest.fn().mockResolvedValue([]) },
    debtLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    // V20.3.2 — Outstanding now batch-loads subscription state
    // for each customer in the page (used to attach
    // `hasActiveSubscription` / `subscriptionExpiresAt` to each
    // row). Default to empty so existing assertions are unaffected.
    customerSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    ),
    ...prisma,
  };
}

function buildAudit() {
  return {
    log: jest.fn(),
    logFinancialEvent: jest.fn(),
  };
}

function buildOrders() {
  return {
    listCollectionsReceivableAggOrders: jest.fn().mockResolvedValue([]),
    sumCollectionsDebtRemainingKd: jest
      .fn()
      .mockResolvedValue(new Prisma.Decimal(0)),
  };
}

function buildDebtVisibility() {
  return {
    getCollectionsSnapshot: jest.fn().mockResolvedValue({
      totalRemainingDebtKd: '0.0000',
      customersWithDebt: 0,
      partiallyPaidInvoices: 0,
      unpaidInvoices: 0,
      overdueInvoices: 0,
      generatedAt: new Date().toISOString(),
    }),
    getCustomerVisibleDebtBatch: jest.fn().mockResolvedValue(new Map()),
  };
}

function build(): {
  service: OutstandingService;
  prisma: PrismaMock;
  audit: AuditMock;
  orders: OrdersMock;
  debtVisibility: DebtVisibilityMock;
} {
  const prisma = buildPrisma();
  const audit = buildAudit();
  const orders = buildOrders();
  const debtVisibility = buildDebtVisibility();
  const service = new OutstandingService(
    prisma as any,
    audit as any,
    orders as any,
    debtVisibility as any,
  );
  return { service, prisma, audit, orders, debtVisibility };
}

describe('OutstandingService', () => {
  describe('listOutstanding', () => {
    it('returns an empty envelope when no orders are open', async () => {
      const { service, prisma, orders, debtVisibility } = build();

      const out = await service.listOutstanding({});

      expect(out.rows).toHaveLength(0);
      expect(out.totalCustomers).toBe(0);
      expect(out.totalDueKd).toBe('0.0000');
      expect(out.source).toBe('COLLECTIONS_ENGINE');
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
      expect(orders.listCollectionsReceivableAggOrders).toHaveBeenCalled();
    });

    it('uses DebtVisibilityService as the single source even when no rows are returned', async () => {
      const { service, debtVisibility } = build();
      debtVisibility.getCollectionsSnapshot.mockResolvedValueOnce({
        totalRemainingDebtKd: '3.2500',
        customersWithDebt: 1,
        partiallyPaidInvoices: 0,
        unpaidInvoices: 1,
        overdueInvoices: 0,
        generatedAt: new Date().toISOString(),
      });

      const out = await service.listOutstanding({});

      expect(out.rows).toHaveLength(0);
      expect(out.totalDueKd).toBe('3.2500');
      expect(out.source).toBe('COLLECTIONS_ENGINE');
    });

    it('aggregates totalDueKd, invoicesCount, lastOrderAt and earliestDueDate per customer', async () => {
      const { service, prisma, orders, debtVisibility } = build();
      const now = new Date('2026-05-06T00:00:00.000Z');
      const olderDue = new Date('2026-04-26T00:00:00.000Z');
      const newerDue = new Date('2026-05-01T00:00:00.000Z');

      orders.listCollectionsReceivableAggOrders.mockResolvedValueOnce([
        {
          id: 'o1',
          customerId: CUSTOMER_A,
          driverId: DRIVER_X,
          totalPrice: new Prisma.Decimal(5),
          createdAt: new Date('2026-05-05T10:00:00Z'),
          dueDate: olderDue,
        },
        {
          id: 'o2',
          customerId: CUSTOMER_A,
          driverId: DRIVER_X,
          totalPrice: new Prisma.Decimal('7.5'),
          createdAt: new Date('2026-05-04T10:00:00Z'),
          dueDate: newerDue,
        },
      ]);
      debtVisibility.getCollectionsSnapshot.mockResolvedValueOnce({
        totalRemainingDebtKd: '5.2500',
        customersWithDebt: 1,
        partiallyPaidInvoices: 1,
        unpaidInvoices: 1,
        overdueInvoices: 0,
        generatedAt: new Date().toISOString(),
      });
      debtVisibility.getCustomerVisibleDebtBatch.mockResolvedValueOnce(
        new Map([
          [
            CUSTOMER_A,
            {
              customerId: CUSTOMER_A,
              remainingDebtKd: '5.2500',
              paidTotalKd: '7.2500',
              totalInvoicesKd: '12.5000',
              journalArBalanceKd: '5.2500',
              walletLiabilityKd: '0.0000',
              walletBalanceKd: '0.0000',
              unpaidInvoicesCount: 1,
              partiallyPaidInvoicesCount: 1,
              activeInvoicesCount: 2,
              overdueInvoicesCount: 0,
              hasDebt: true,
              lastPaymentAt: null,
              lastInvoiceAt: null,
              canonicalSource: 'JOURNAL_AR',
              fromSnapshot: false,
              snapshotRefreshedAt: null,
            },
          ],
        ]),
      );
      prisma.customer.findMany.mockResolvedValueOnce([
        {
          id: CUSTOMER_A,
          displayName: 'Acme',
          phone: '99000000',
          phone2: null,
          isBlocked: false,
        },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([
        { id: DRIVER_X, fullName: 'Driver X' },
      ]);
      prisma.customerCollectionStatus.findMany.mockResolvedValueOnce([]);

      jest.useFakeTimers().setSystemTime(now);
      const out = await service.listOutstanding({});
      jest.useRealTimers();

      expect(out.rows).toHaveLength(1);
      const row = out.rows[0];
      expect(row.customerId).toBe(CUSTOMER_A);
      expect(row.invoicesCount).toBe(2);
      // V23.3 — `OutstandingRow.totalDueKd` is now a canonical 4dp
        // KWD string. Numeric closeness checks were replaced with an
        // exact string equality assertion.
        expect(row.totalDueKd).toBe('12.5000');
        expect(out.totalDueKd).toBe('12.5000');
      expect(out.source).toBe('COLLECTIONS_ENGINE');
      expect(row.driverName).toBe('Driver X');
      expect(row.earliestDueDate).toBe(olderDue.toISOString());
      expect(row.daysLate).toBe(10);
      expect(row.priorityScore).toBeCloseTo(12.5 * 0.6 + 10 * 0.4, 4);
      expect(row.status).toBe(CustomerCollectionStatusKind.NORMAL);
      expect(out.driverSummaries).toEqual([
        {
          driverId: DRIVER_X,
          driverName: 'Driver X',
          customers: 1,
          invoices: 2,
          totalRemainingKd: '12.5000',
          maxDaysLate: 10,
        },
      ]);
    });

    it('passes explicit createdAt bounds + driverId into Orders collections helper', async () => {
      const { service, orders } = build();
      await service.listOutstanding({
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-30T00:00:00.000Z',
        driverId: DRIVER_X,
      });

      expect(orders.listCollectionsReceivableAggOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: DRIVER_X,
          createdAt: {
            gte: new Date('2026-04-01T00:00:00.000Z'),
            lte: new Date('2026-04-30T00:00:00.000Z'),
          },
        }),
      );
    });

    it('rejects an inverted date window', async () => {
      const { service } = build();
      await expect(
        service.listOutstanding({
          from: '2026-05-10T00:00:00Z',
          to: '2026-05-01T00:00:00Z',
        }),
      ).rejects.toThrow(/from.*before.*to/i);
    });

    it('filters rows while totalDueKd remains canonical from DebtVisibilityService', async () => {
      const { service, prisma, orders, debtVisibility } = build();
      orders.listCollectionsReceivableAggOrders.mockResolvedValueOnce([
        {
          id: 'o1',
          customerId: CUSTOMER_A,
          driverId: null,
          totalPrice: new Prisma.Decimal(1),
          createdAt: new Date(),
          dueDate: null,
        },
        {
          id: 'o2',
          customerId: CUSTOMER_B,
          driverId: null,
          totalPrice: new Prisma.Decimal(2),
          createdAt: new Date(),
          dueDate: null,
        },
      ]);
      debtVisibility.getCollectionsSnapshot.mockResolvedValueOnce({
        totalRemainingDebtKd: '1.2500',
        customersWithDebt: 1,
        partiallyPaidInvoices: 0,
        unpaidInvoices: 1,
        overdueInvoices: 0,
        generatedAt: new Date().toISOString(),
      });
      debtVisibility.getCustomerVisibleDebtBatch.mockResolvedValueOnce(
        new Map([
          [
            CUSTOMER_A,
            {
              customerId: CUSTOMER_A,
              remainingDebtKd: '0.0000',
              paidTotalKd: '1.0000',
              totalInvoicesKd: '1.0000',
              journalArBalanceKd: '0.0000',
              walletLiabilityKd: '0.0000',
              walletBalanceKd: '0.0000',
              unpaidInvoicesCount: 0,
              partiallyPaidInvoicesCount: 0,
              activeInvoicesCount: 0,
              overdueInvoicesCount: 0,
              hasDebt: false,
              lastPaymentAt: null,
              lastInvoiceAt: null,
              canonicalSource: 'JOURNAL_AR',
              fromSnapshot: false,
              snapshotRefreshedAt: null,
            },
          ],
          [
            CUSTOMER_B,
            {
              customerId: CUSTOMER_B,
              remainingDebtKd: '1.2500',
              paidTotalKd: '0.7500',
              totalInvoicesKd: '2.0000',
              journalArBalanceKd: '1.2500',
              walletLiabilityKd: '0.0000',
              walletBalanceKd: '0.0000',
              unpaidInvoicesCount: 1,
              partiallyPaidInvoicesCount: 1,
              activeInvoicesCount: 1,
              overdueInvoicesCount: 0,
              hasDebt: true,
              lastPaymentAt: null,
              lastInvoiceAt: null,
              canonicalSource: 'JOURNAL_AR',
              fromSnapshot: false,
              snapshotRefreshedAt: null,
            },
          ],
        ]),
      );
      prisma.customer.findMany.mockResolvedValueOnce([
        {
          id: CUSTOMER_A,
          displayName: 'Acme',
          phone: '99000000',
          phone2: null,
          isBlocked: false,
        },
        {
          id: CUSTOMER_B,
          displayName: 'Beta',
          phone: '88111111',
          phone2: null,
          isBlocked: true,
        },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([]);
      prisma.customerCollectionStatus.findMany.mockResolvedValueOnce([
        {
          customerId: CUSTOMER_B,
          status: CustomerCollectionStatusKind.RISK,
          blocked: true,
          note: null,
          updatedAt: new Date(),
          updatedById: null,
          id: 'x',
        },
      ]);

      const onlyBlocked = await service.listOutstanding({ blocked: true });
      expect(onlyBlocked.rows.map((r) => r.customerId)).toEqual([CUSTOMER_B]);
      expect(onlyBlocked.blockedCount).toBe(1);
      expect(onlyBlocked.riskCount).toBe(1);
      expect(onlyBlocked.totalDueKd).toBe('2.0000');
      expect(onlyBlocked.source).toBe('COLLECTIONS_ENGINE');
    });

    it('locks the outstanding module against duplicate AR total aggregations', () => {
      const root = __dirname;
      const forbiddenReduce = 'reduce' + '(';
      const forbiddenDirectOrderQuery = 'prisma.order.findMany';
      const offenders: string[] = [];

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          const st = statSync(full);
          if (st.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
          const source = readFileSync(full, 'utf8');
          if (
            source.includes(forbiddenReduce) ||
            source.includes(forbiddenDirectOrderQuery)
          ) {
            offenders.push(full);
          }
        }
      };

      walk(root);
      expect(offenders).toEqual([]);
    });

    it('locks the frontend outstanding page against client-side total aggregation', () => {
      const root = join(
        __dirname,
        '..',
        '..',
        '..',
        'web',
        'src',
        'modules',
        'call-center',
        'outstanding',
      );
      const forbiddenReduce = 'reduce' + '(';
      const offenders: string[] = [];

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          const st = statSync(full);
          if (st.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
          const source = readFileSync(full, 'utf8');
          if (source.includes(forbiddenReduce)) {
            offenders.push(full);
          }
        }
      };

      walk(root);
      expect(offenders).toEqual([]);
    });
  });

  describe('updateCollectionStatus', () => {
    it('rejects roles outside CALL_CENTER / SUPERVISOR / OWNER', async () => {
      const { service } = build();
      await expect(
        service.updateCollectionStatus({
          customerId: CUSTOMER_A,
          body: {
            status: CustomerCollectionStatusKind.LATE,
            blocked: false,
          },
          actorUserId: 'u',
          actorRole: 'DRIVER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the customer id is unknown', async () => {
      const { service, prisma } = build();
      prisma.customer.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateCollectionStatus({
          customerId: CUSTOMER_A,
          body: {
            status: CustomerCollectionStatusKind.LATE,
            blocked: false,
          },
          actorUserId: 'u',
          actorRole: 'CALL_CENTER',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mirrors block=true to Customer.isBlocked + emits CUSTOMER_BLOCKED', async () => {
      const { service, prisma, audit } = build();
      prisma.customer.findUnique.mockResolvedValueOnce({
        id: CUSTOMER_A,
        isBlocked: false,
        blockReason: null,
        blockedAt: null,
      });
      prisma.customerCollectionStatus.findUnique.mockResolvedValueOnce(null);
      prisma.customerCollectionStatus.upsert.mockResolvedValueOnce({
        id: 'x',
        customerId: CUSTOMER_A,
        status: CustomerCollectionStatusKind.RISK,
        blocked: true,
        note: 'manual',
        updatedAt: new Date(),
        updatedById: 'u1',
      });

      await service.updateCollectionStatus({
        customerId: CUSTOMER_A,
        body: {
          status: CustomerCollectionStatusKind.RISK,
          blocked: true,
          note: 'manual',
        },
        actorUserId: 'u1',
        actorRole: 'CALL_CENTER',
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_A },
        data: expect.objectContaining({ isBlocked: true }),
      });
      expect(audit.logFinancialEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_BLOCKED',
          customerId: CUSTOMER_A,
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_COLLECTION_UPDATED',
          status: AuditStatus.SUCCESS,
        }),
      );
    });

    it('emits CUSTOMER_UNBLOCKED when manual toggle clears a block', async () => {
      const { service, prisma, audit } = build();
      prisma.customer.findUnique.mockResolvedValueOnce({
        id: CUSTOMER_A,
        isBlocked: true,
        blockReason: 'old',
        blockedAt: new Date(),
      });
      prisma.customerCollectionStatus.findUnique.mockResolvedValueOnce({
        customerId: CUSTOMER_A,
        status: CustomerCollectionStatusKind.RISK,
        blocked: true,
        note: 'old',
        updatedAt: new Date(),
        updatedById: null,
        id: 'x',
      });
      prisma.customerCollectionStatus.upsert.mockResolvedValueOnce({
        id: 'x',
        customerId: CUSTOMER_A,
        status: CustomerCollectionStatusKind.NORMAL,
        blocked: false,
        note: null,
        updatedAt: new Date(),
        updatedById: 'u',
      });

      await service.updateCollectionStatus({
        customerId: CUSTOMER_A,
        body: {
          status: CustomerCollectionStatusKind.NORMAL,
          blocked: false,
        },
        actorUserId: 'u',
        actorRole: 'OWNER',
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_A },
        data: { isBlocked: false, blockReason: null, blockedAt: null },
      });
      expect(audit.logFinancialEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_UNBLOCKED' }),
      );
    });
  });

  describe('assertNotBlocked', () => {
    it('passes silently when no AR row exists', async () => {
      const { service, prisma } = build();
      prisma.customerCollectionStatus.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.assertNotBlocked(CUSTOMER_A),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when blocked=true', async () => {
      const { service, prisma } = build();
      prisma.customerCollectionStatus.findUnique.mockResolvedValueOnce({
        blocked: true,
        note: 'late payments',
      });
      await expect(service.assertNotBlocked(CUSTOMER_A)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getCollectionStatus', () => {
    it('falls back to a NORMAL stub when no row exists', async () => {
      const { service, prisma } = build();
      prisma.customer.findUnique.mockResolvedValueOnce({
        id: CUSTOMER_A,
        isBlocked: false,
      });
      prisma.customerCollectionStatus.findUnique.mockResolvedValueOnce(null);

      const out = await service.getCollectionStatus(CUSTOMER_A);
      expect(out.status).toBe(CustomerCollectionStatusKind.NORMAL);
      expect(out.blocked).toBe(false);
    });
  });
});
