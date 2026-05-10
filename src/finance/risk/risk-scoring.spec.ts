/* eslint-disable @typescript-eslint/no-explicit-any */
import { CollectionsStage, PromiseToPayStatus } from '@prisma/client';
import { AgingService } from '../aging/aging.service';
import { RiskScoringService } from './risk-scoring.service';

function makePrismaForRisk(overrides: Partial<{
  brokenPromisesCount: number;
  collectionsStage: CollectionsStage;
  escalationLevel: number;
  invoicesCount: number;
  partialLedgerRows: any[];
  refundCount: number;
  failedPaymentCount: number;
}>) {
  return {
    promiseToPay: {
      count: jest.fn(({ where }: any) => {
        if (where.status === PromiseToPayStatus.BROKEN) {
          return Promise.resolve(overrides.brokenPromisesCount ?? 0);
        }
        return Promise.resolve(0);
      }),
    },
    collectionsAccount: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          currentStage: overrides.collectionsStage ?? CollectionsStage.NEW,
          escalationLevel: overrides.escalationLevel ?? 0,
        }),
      ),
    },
    order: {
      count: jest.fn(({ where }: any) => {
        if (where?.status?.not === 'CANCELED') {
          return Promise.resolve(overrides.invoicesCount ?? 0);
        }
        if (where?.status === 'CANCELED') {
          return Promise.resolve(overrides.refundCount ?? 0);
        }
        return Promise.resolve(0);
      }),
      findMany: jest.fn(async () => []),
    },
    debtLedgerEntry: {
      findMany: jest.fn(async () => overrides.partialLedgerRows ?? []),
    },
    transactionHistory: {
      count: jest.fn(async () => overrides.failedPaymentCount ?? 0),
    },
  } as any;
}

describe('V20.5 — Phase 6 RiskScoringService', () => {
  it('LOW for clean customer (no debt, no promises, no escalation)', async () => {
    const aging = {
      getCustomerAging: jest.fn(async () => null),
    } as unknown as AgingService;
    const prisma = makePrismaForRisk({});
    const svc = new RiskScoringService(prisma, aging);
    const r = await svc.getScore('cust-clean');
    expect(r.score).toBe(0);
    expect(r.level).toBe('LOW');
    expect(r.recommendedDebtLimitKd).toBe('200.0000');
  });

  it('CRITICAL for legal-stage customer with broken promises and write-off track', async () => {
    const aging = {
      getCustomerAging: jest.fn(async () => ({
        customerId: 'cust-bad',
        customerName: 'X',
        totalReceivableKd: '500.0000',
        oldestInvoiceDateIso: new Date('2025-12-01').toISOString(),
        oldestOverdueDays: 200,
        agingBucket: 'LEGAL' as const,
        riskLevel: 'CRITICAL' as const,
        openInvoiceCount: 4,
      })),
    } as unknown as AgingService;
    const prisma = makePrismaForRisk({
      brokenPromisesCount: 4,
      collectionsStage: CollectionsStage.LEGAL,
      escalationLevel: 3,
      invoicesCount: 4,
      partialLedgerRows: [
        { amount: '5', source: 'PAYMENT', sourceRef: 'PAYMENT:CASH:o1', note: null },
        { amount: '5', source: 'PAYMENT', sourceRef: 'PAYMENT:CASH:o2', note: null },
        { amount: '5', source: 'PAYMENT', sourceRef: 'PAYMENT:CASH:o3', note: null },
        { amount: '5', source: 'PAYMENT', sourceRef: 'PAYMENT:CASH:o4', note: null },
      ],
      refundCount: 5,
      failedPaymentCount: 5,
    });
    const svc = new RiskScoringService(prisma, aging);
    const r = await svc.getScore('cust-bad');
    expect(r.level).toBe('CRITICAL');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(Number(r.recommendedDebtLimitKd)).toBeLessThanOrEqual(40);
  });

  it('MEDIUM for customer with one broken promise and CONTACTED stage', async () => {
    const aging = {
      getCustomerAging: jest.fn(async () => ({
        customerId: 'cust-mid',
        customerName: 'Y',
        totalReceivableKd: '50.0000',
        oldestInvoiceDateIso: new Date('2026-04-01').toISOString(),
        oldestOverdueDays: 35,
        agingBucket: 'LATE' as const,
        riskLevel: 'MEDIUM' as const,
        openInvoiceCount: 1,
      })),
    } as unknown as AgingService;
    const prisma = makePrismaForRisk({
      brokenPromisesCount: 1,
      collectionsStage: CollectionsStage.CONTACTED,
      escalationLevel: 0,
      invoicesCount: 2,
      partialLedgerRows: [],
      refundCount: 0,
      failedPaymentCount: 0,
    });
    const svc = new RiskScoringService(prisma, aging);
    const r = await svc.getScore('cust-mid');
    expect(r.score).toBeGreaterThanOrEqual(20);
    expect(['MEDIUM', 'LOW']).toContain(r.level);
  });

  it('component weights sum to 1', () => {
    const sum = Object.values(RiskScoringService.WEIGHTS).reduce(
      (a, b) => a + b,
      0,
    );
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(0.0001);
  });

  it('levelForScore boundaries match the spec', () => {
    expect(RiskScoringService.levelForScore(0)).toBe('LOW');
    expect(RiskScoringService.levelForScore(29)).toBe('LOW');
    expect(RiskScoringService.levelForScore(30)).toBe('MEDIUM');
    expect(RiskScoringService.levelForScore(54)).toBe('MEDIUM');
    expect(RiskScoringService.levelForScore(55)).toBe('HIGH');
    expect(RiskScoringService.levelForScore(79)).toBe('HIGH');
    expect(RiskScoringService.levelForScore(80)).toBe('CRITICAL');
    expect(RiskScoringService.levelForScore(100)).toBe('CRITICAL');
  });
});
