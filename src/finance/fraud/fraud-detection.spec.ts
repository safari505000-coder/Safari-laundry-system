/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FraudAlertSeverity,
  FraudAlertStatus,
  GeneralLedgerEntryType,
  Prisma,
} from '@prisma/client';
import { DebtSource } from '../enums/debt-source.enum';
import { FraudDetectionService } from './fraud-detection.service';

function makePrismaForFraud(seed: {
  glRows?: any[];
  ledgerRows?: any[];
  cancelledOrders?: any[];
}) {
  const alerts: any[] = [];
  return {
    generalLedgerEntry: {
      findMany: jest.fn(({ where }: any) => {
        const rows = seed.glRows ?? [];
        if (where?.entryType?.in) {
          return Promise.resolve(rows.filter((r) => where.entryType.in.includes(r.entryType)));
        }
        if (where?.entryType) {
          return Promise.resolve(rows.filter((r) => r.entryType === where.entryType));
        }
        return Promise.resolve(rows);
      }),
    },
    debtLedgerEntry: {
      findMany: jest.fn(({ where }: any) => {
        const rows = seed.ledgerRows ?? [];
        if (where?.source) return Promise.resolve(rows.filter((r) => r.source === where.source));
        return Promise.resolve(rows);
      }),
    },
    // V20.4 — detectRepeatedPayments and detectPaymentSplitting now read
    // from JournalEntry source='PAYMENT'. Map ledgerRows to journal entries
    // with a credit line on account 1300 so amount detection still fires.
    journalEntry: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (seed.ledgerRows ?? []).map((r) => ({
            source: r.source,
            customerId: r.customerId,
            orderId: r.orderId,
            createdAt: r.createdAt,
            lines: [{ credit: new Prisma.Decimal(r.amount.toString()) }],
          })),
        ),
      ),
    },
    order: {
      findMany: jest.fn(() => Promise.resolve(seed.cancelledOrders ?? [])),
    },
    fraudAlert: {
      create: jest.fn(({ data }: any) => {
        if (alerts.some((a) => a.fingerprint === data.fingerprint)) {
          const err: any = new Prisma.PrismaClientKnownRequestError(
            'unique',
            { code: 'P2002', clientVersion: 'test' } as any,
          );
          return Promise.reject(err);
        }
        const row = { id: `fa-${alerts.length + 1}`, ...data, detectedAt: new Date() };
        alerts.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn(() => Promise.resolve(alerts)),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(alerts.find((a) => a.id === where.id) ?? null),
      ),
      update: jest.fn(({ where, data }: any) => {
        const row = alerts.find((a) => a.id === where.id);
        if (!row) return Promise.reject(new Error('not found'));
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    _alerts: alerts,
  } as any;
}

describe('V20.5 — Phase 8 FraudDetectionService', () => {
  it('detectRapidReversals fires when ≥2 reversals on same order within 60min', async () => {
    const now = Date.now();
    const prisma = makePrismaForFraud({
      glRows: [
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(now - 30 * 60 * 1000),
        },
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(now - 15 * 60 * 1000),
        },
      ],
    });
    const svc = new FraudDetectionService(prisma);
    const out = await svc.runAll();
    expect(out.perDetector.RAPID_REVERSALS).toBe(1);
    expect(prisma._alerts[0].type).toBe('RAPID_REVERSALS');
  });

  it('detectRepeatedPayments fires when ≥5 payments on same order in 24h', async () => {
    const now = Date.now();
    const ledgerRows = Array.from({ length: 6 }).map((_, i) => ({
      source: DebtSource.PAYMENT,
      customerId: 'c-1',
      orderId: 'o-1',
      amount: new Prisma.Decimal('5'),
      createdAt: new Date(now - i * 60 * 1000),
    }));
    const prisma = makePrismaForFraud({ ledgerRows });
    const svc = new FraudDetectionService(prisma);
    const out = await svc.runAll();
    expect(out.perDetector.REPEATED_PAYMENT_ATTEMPTS).toBe(1);
  });

  it('detectSuspiciousRefunds fires for large early-life refunds', async () => {
    const now = Date.now();
    const prisma = makePrismaForFraud({
      cancelledOrders: [
        {
          id: 'o-1',
          customerId: 'c-1',
          totalPrice: new Prisma.Decimal('300'),
          createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now - 60 * 1000),
        },
      ],
    });
    const svc = new FraudDetectionService(prisma);
    const out = await svc.runAll();
    expect(out.perDetector.SUSPICIOUS_REFUND).toBe(1);
    expect(prisma._alerts.find((a: any) => a.type === 'SUSPICIOUS_REFUND').severity).toBe(FraudAlertSeverity.HIGH);
  });

  it('detectPaymentSplitting fires for ≥4 sub-10 payments on same invoice', async () => {
    const now = Date.now();
    const ledgerRows = Array.from({ length: 5 }).map((_, i) => ({
      source: DebtSource.PAYMENT,
      customerId: 'c-1',
      orderId: 'o-1',
      amount: new Prisma.Decimal('5'),
      createdAt: new Date(now - i * 60 * 1000),
    }));
    const prisma = makePrismaForFraud({ ledgerRows });
    const svc = new FraudDetectionService(prisma);
    const out = await svc.runAll();
    expect(out.perDetector.PAYMENT_SPLITTING).toBe(1);
  });

  it('detectExcessiveWalletAdj fires for ≥3 adjustments by one actor in 24h', async () => {
    const now = Date.now();
    const glRows = Array.from({ length: 4 }).map((_, i) => ({
      entryType: GeneralLedgerEntryType.WALLET_SETTLEMENT,
      customerId: `c-${i}`,
      actorUserId: 'actor-1',
      createdAt: new Date(now - i * 60 * 1000),
    }));
    const prisma = makePrismaForFraud({ glRows });
    const svc = new FraudDetectionService(prisma);
    const out = await svc.runAll();
    expect(out.perDetector.EXCESSIVE_WALLET_ADJ).toBe(1);
  });

  it('idempotent — re-running same window does not duplicate alerts', async () => {
    const now = Date.now();
    const prisma = makePrismaForFraud({
      glRows: [
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(now - 30 * 60 * 1000),
        },
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(now - 15 * 60 * 1000),
        },
      ],
    });
    const svc = new FraudDetectionService(prisma);
    await svc.runAll();
    const out2 = await svc.runAll();
    expect(out2.perDetector.RAPID_REVERSALS).toBe(0);
    expect(prisma._alerts).toHaveLength(1);
  });

  it('resolve transitions OPEN → RESOLVED_*', async () => {
    const prisma = makePrismaForFraud({
      glRows: [
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(),
        },
        {
          entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
          customerId: 'c-1',
          orderId: 'o-1',
          amount: new Prisma.Decimal('10'),
          createdAt: new Date(),
        },
      ],
    });
    const svc = new FraudDetectionService(prisma);
    await svc.runAll();
    const id = prisma._alerts[0].id;
    const r = await svc.resolve({
      alertId: id,
      actorId: 'u-1',
      status: FraudAlertStatus.RESOLVED_FALSE_POSITIVE,
      notes: 'reviewed by audit',
    });
    expect(r.status).toBe(FraudAlertStatus.RESOLVED_FALSE_POSITIVE);
    expect(r.resolvedAt).toBeInstanceOf(Date);
  });
});
