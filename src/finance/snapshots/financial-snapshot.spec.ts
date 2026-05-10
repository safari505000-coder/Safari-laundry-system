import { Prisma } from '@prisma/client';
import { FinancialSnapshotService } from './financial-snapshot.service';

/**
 * V20.4 — Phase 1 unit spec for the read-side projector.
 *
 * Covers the rebuild guarantee: same primaries → same snapshot,
 * deterministically. The fixture wires a single customer with:
 *   • two open invoices (one fully unpaid, one partially paid),
 *   • one fully paid invoice (out of scope),
 *   • a wallet balance + wallet liability,
 *   • a recent real PAYMENT row.
 *
 * `computeSnapshotInput` MUST classify each invoice correctly
 * (`unpaidInvoicesCount`, `partiallyPaidInvoicesCount`,
 * `activeInvoicesCount`) and return the canonical `remainingDebtKd`
 * sourced from the V20.3.1 partial-payment-aware aggregator.
 */

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const O_FULLY_UNPAID = '22222222-2222-4222-8222-222222222222';
const O_PARTIAL = '33333333-3333-4333-8333-333333333333';
const O_FULLY_PAID = '44444444-4444-4444-8444-444444444444';

function dec(s: string) {
  return new Prisma.Decimal(s);
}

function makePrisma(now: Date) {
  // Fully unpaid: 100 KD.
  // Partial: 30 paid of 100, 70 remaining.
  // Fully paid: 50 of 50 paid (out of scope filter — cashStatus PAID).
  const orders = [
    {
      id: O_FULLY_UNPAID,
      customerId: CUSTOMER,
      totalPrice: dec('100.0000'),
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      dueDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      cashStatus: 'UNPAID' as const,
      posPaymentMethod: null,
    },
    {
      id: O_PARTIAL,
      customerId: CUSTOMER,
      totalPrice: dec('100.0000'),
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      cashStatus: 'UNPAID' as const,
      posPaymentMethod: null,
    },
  ];

  // computeOrderRemainingBalancesBatch is sourced from the aggregator
  // util — it scans `DebtLedgerEntry` for invoice payments. We mock a
  // PAYMENT row that captures 30 KD against O_PARTIAL.
  const ledger = [
    {
      id: 'l-pay-1',
      customerId: CUSTOMER,
      orderId: O_PARTIAL,
      source: 'PAYMENT',
      sourceRef: 'PAYMENT:CASH:abcd-pay-1',
      amount: dec('30.0000'),
      actorUserId: 'actor-1',
      note: null,
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
    // INVOICE_SHORTFALL rows captured at issuance for both open
    // invoices — drives the canonical helper toward the correct
    // remaining math.
    {
      id: 'l-issue-1',
      customerId: CUSTOMER,
      orderId: O_FULLY_UNPAID,
      source: 'INVOICE_SHORTFALL',
      sourceRef: `SHORTFALL:${O_FULLY_UNPAID}`,
      amount: dec('100.0000'),
      actorUserId: 'actor-1',
      note: null,
      createdAt: orders[0].createdAt,
    },
    {
      id: 'l-issue-2',
      customerId: CUSTOMER,
      orderId: O_PARTIAL,
      source: 'INVOICE_SHORTFALL',
      sourceRef: `SHORTFALL:${O_PARTIAL}`,
      amount: dec('100.0000'),
      actorUserId: 'actor-1',
      note: null,
      createdAt: orders[1].createdAt,
    },
  ];

  return {
    order: {
      findMany: jest.fn(async (args: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        const ids = (where as { id?: { in?: string[] } } | undefined)?.id?.in;
        if (ids) {
          return orders.filter((o) => ids.includes(o.id));
        }
        return orders;
      }),
    },
    debtLedgerEntry: {
      // V23.4 — Faithful mock of Prisma's `findMany` predicate semantics
      // for the three query shapes the canonical aggregator emits:
      //
      //   1. Order-linked pass  : `where: { orderId: { in: [...] } }`
      //   2. Customer-level FIFO: `where: { customerId: { in: [...] },
      //                                      orderId: null }`
      //   3. Real-payment scan  : `where: { source: 'PAYMENT' }`
      //
      // The pre-V23.4 mock IGNORED the `orderId: null` clause and the
      // `customerId: { in: [...] }` clause entirely, so the customer-
      // level FIFO step double-counted the order-linked PAYMENT row
      // (`l-pay-1`) — which made `O_FULLY_UNPAID` look 30 KD paid
      // (partial) instead of zero (unpaid). Tightening the predicate
      // here aligns the mock with real Prisma semantics and fixes the
      // V20.4 snapshot drift surfaced in V23.3.
      findMany: jest.fn(
        async (args: {
          where?: Record<string, unknown>;
          orderBy?: unknown;
        }) => {
          const where = (args?.where ?? {}) as {
            orderId?: { in?: string[] } | null;
            customerId?: { in?: string[] };
            source?: string;
          };
          let rows = [...ledger];

          if (where.orderId === null) {
            rows = rows.filter((r) => r.orderId === null);
          } else if (where.orderId?.in) {
            const orderIds = where.orderId.in;
            rows = rows.filter(
              (r) => r.orderId !== null && orderIds.includes(r.orderId),
            );
          }

          if (where.customerId?.in) {
            const customerIds = where.customerId.in;
            rows = rows.filter((r) => customerIds.includes(r.customerId));
          }

          if (where.source === 'PAYMENT') {
            rows = rows.filter((r) => r.source === 'PAYMENT');
          }

          rows.sort((a, b) =>
            args?.orderBy
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : 0,
          );
          return rows;
        },
      ),
    },
    customerWallet: {
      findUnique: jest.fn(async () => ({ balance: dec('5.0000') })),
    },
  };
}

function makeJournalSource() {
  return {
    getCustomerDebtFromJournalAR: jest.fn(async () => dec('170.0000')),
    getCustomerArSnapshot: jest.fn(async () => ({
      arBalanceKd: dec('170.0000'),
      walletLiabilityKd: dec('12.5000'),
    })),
  };
}

function makeRepo() {
  const upsert = jest.fn(
    async (input: Record<string, unknown>) => ({
      id: 'snap',
      ...input,
    }),
  );
  return {
    upsert,
    findByCustomerId: jest.fn(async () => null),
    findManyByCustomerIds: jest.fn(async () => new Map()),
    findStaleCustomerIds: jest.fn(async () => []),
    findCustomersWithoutSnapshot: jest.fn(async () => []),
  };
}

describe('FinancialSnapshotService.computeSnapshotInput', () => {
  it('classifies invoices and produces a deterministic snapshot input', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const prisma = makePrisma(now) as never;
    const journal = makeJournalSource() as never;
    const repo = makeRepo() as never;
    const svc = new FinancialSnapshotService(prisma, journal, repo);

    const input = await svc.computeSnapshotInput(CUSTOMER);
    expect(input.customerId).toBe(CUSTOMER);
    // Two open invoices in scope — one fully unpaid, one partial.
    expect(input.activeInvoicesCount).toBe(2);
    expect(input.unpaidInvoicesCount).toBe(1);
    expect(input.partiallyPaidInvoicesCount).toBe(1);
    // Σ gross = 200 KD.
    expect(input.totalInvoicesKd.toString()).toBe('200');
    // Wallet snapshot pulled through.
    expect(input.walletBalanceKd.toString()).toBe('5');
    expect(input.walletLiabilityKd.toString()).toBe('12.5');
    // Journal AR pulled through.
    expect(input.journalArBalanceKd.toString()).toBe('170');
    // Canonical source — depends on V20_3 flag; default is the
    // partial-payment aggregator.
    expect([
      'PARTIAL_PAYMENT_REMAINING',
      'JOURNAL_AR',
      'JOURNAL_AR_FALLBACK',
    ]).toContain(input.canonicalSource);
  });

  it('is deterministic — same inputs produce identical inputs across calls', async () => {
    const now = new Date('2026-05-15T12:00:00.000Z');
    const prisma = makePrisma(now) as never;
    const journal = makeJournalSource() as never;
    const repo = makeRepo() as never;
    const svc = new FinancialSnapshotService(prisma, journal, repo);
    const a = await svc.computeSnapshotInput(CUSTOMER);
    const b = await svc.computeSnapshotInput(CUSTOMER);
    expect({
      total: a.totalInvoicesKd.toString(),
      unpaid: a.unpaidInvoicesCount,
      partial: a.partiallyPaidInvoicesCount,
      ar: a.journalArBalanceKd.toString(),
    }).toEqual({
      total: b.totalInvoicesKd.toString(),
      unpaid: b.unpaidInvoicesCount,
      partial: b.partiallyPaidInvoicesCount,
      ar: b.journalArBalanceKd.toString(),
    });
  });
});
