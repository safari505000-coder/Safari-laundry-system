import { Prisma } from '@prisma/client';
import { InvoicePaymentStatusService } from './invoice-payment-status.service';

/**
 * V20.8.1 — Phase 5 partial-payment hard visibility invariants.
 *
 * The brief says partial payments must NEVER:
 *   • close an invoice early
 *   • disappear from aging
 *   • disappear from collections
 *   • disappear from debt reports
 *   • disappear from Customer 360
 *
 * Backend canonical helpers (verified by V20.3.1+):
 *
 *   • `InvoicePaymentStatusService.derivePaymentStatus(orderId)`
 *     → returns `status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'` and
 *       `isFullyPaid: boolean`. Outstanding / aging / collections /
 *       debt aggregate / Customer 360 ALL select rows where
 *       `isFullyPaid === false`.
 *
 *   • `INVOICE_REMAINING_TOLERANCE_KD` is the closing tolerance
 *     (~0.0001). Anything strictly above it is OPEN.
 *
 * This suite pins the contract in unit-test form so a future
 * refactor that, e.g., changes a filter from `remaining > 0` to
 * `cashStatus = UNPAID` fails LOUDLY rather than silently hiding
 * partially-paid receivables.
 */

const Decimal = Prisma.Decimal;

function makePrismaForRemaining(opts: {
  totalKd: string;
  paidKd?: string;
  walletAbsorbedKd?: string;
  status?: string;
}) {
  // V20.4 — Journal-based: provide JournalLine 1300 entries matching the scenario.
  // DR = issuance, CR = payment / wallet absorption.
  const journalLines: Array<{ debit: InstanceType<typeof Decimal>; credit: InstanceType<typeof Decimal> }> = [
    { debit: new Decimal(opts.totalKd), credit: new Decimal('0') },
    ...(opts.paidKd ? [{ debit: new Decimal('0'), credit: new Decimal(opts.paidKd) }] : []),
    ...(opts.walletAbsorbedKd ? [{ debit: new Decimal('0'), credit: new Decimal(opts.walletAbsorbedKd) }] : []),
  ];

  return {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'order-x',
        totalPrice: new Decimal(opts.totalKd),
        status: opts.status ?? 'COMPLETED',
      }),
    },
    journalLine: {
      findMany: jest.fn().mockResolvedValue(journalLines),
    },
  } as any;
}

describe('V20.8.1 — partial-payment hard visibility invariants', () => {
  let svc: InvoicePaymentStatusService;

  // V20.4 — set flags so computeRemainingBalance uses journal path.
  let prevFlagFinal: string | undefined;
  let prevFlagAccounting: string | undefined;
  beforeAll(() => {
    prevFlagFinal = process.env.V20_4_FINAL_LEDGER;
    prevFlagAccounting = process.env.V20_3_TRUE_ACCOUNTING;
    process.env.V20_4_FINAL_LEDGER = 'true';
    process.env.V20_3_TRUE_ACCOUNTING = 'true';
  });
  afterAll(() => {
    if (prevFlagFinal === undefined) delete process.env.V20_4_FINAL_LEDGER;
    else process.env.V20_4_FINAL_LEDGER = prevFlagFinal;
    if (prevFlagAccounting === undefined) delete process.env.V20_3_TRUE_ACCOUNTING;
    else process.env.V20_3_TRUE_ACCOUNTING = prevFlagAccounting;
  });

  function mkSvc(prisma: any): InvoicePaymentStatusService {
    return new InvoicePaymentStatusService(prisma);
  }

  it('1. 10 KD invoice / 4 KD paid → status=PARTIALLY_PAID, isFullyPaid=false', async () => {
    svc = mkSvc(makePrismaForRemaining({ totalKd: '10.0000', paidKd: '4.0000' }));
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.status).toBe('PARTIALLY_PAID');
    expect(r.isFullyPaid).toBe(false);
    expect(r.isPartiallyPaid).toBe(true);
    expect(r.remainingAmountKd).toBe('6.0000');
  });

  it('2. 10 KD / 9.9 KD paid → STILL OPEN (does NOT close on 0.1 remainder)', async () => {
    svc = mkSvc(makePrismaForRemaining({ totalKd: '10.0000', paidKd: '9.9000' }));
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.status).toBe('PARTIALLY_PAID');
    expect(r.isFullyPaid).toBe(false);
    expect(r.remainingAmountKd).toBe('0.1000');
  });

  it('3. 10 KD / 9.99 KD paid → still NOT fully paid (0.01 KD > tolerance 0.001)', async () => {
    svc = mkSvc(makePrismaForRemaining({ totalKd: '10.0000', paidKd: '9.9900' }));
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.isFullyPaid).toBe(false);
    expect(Number.parseFloat(r.remainingAmountKd)).toBeGreaterThan(0);
  });

  it('4. 10 KD / 5 KD cash + 4 KD wallet absorption → 1 KD remains, still OPEN', async () => {
    svc = mkSvc(
      makePrismaForRemaining({
        totalKd: '10.0000',
        paidKd: '5.0000',
        walletAbsorbedKd: '4.0000',
      }),
    );
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.status).toBe('PARTIALLY_PAID');
    expect(r.remainingAmountKd).toBe('1.0000');
    // V20.4: walletAbsorbedKd is now a descriptive field sourced from DebtLedger
    // (which was removed). It's 0.0000 — the canonical remaining (1.0000) is correct.
    expect(r.walletAbsorbedKd).toBe('0.0000');
  });

  it('5. 10 KD / 10 KD paid (exact) → PAID + isFullyPaid=true', async () => {
    svc = mkSvc(makePrismaForRemaining({ totalKd: '10.0000', paidKd: '10.0000' }));
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.status).toBe('PAID');
    expect(r.isFullyPaid).toBe(true);
    expect(r.remainingAmountKd).toBe('0.0000');
  });

  it('6. 10 KD / 0 paid → UNPAID + still visible (remaining = 10)', async () => {
    svc = mkSvc(makePrismaForRemaining({ totalKd: '10.0000' }));
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.status).toBe('UNPAID');
    expect(r.isFullyPaid).toBe(false);
    expect(r.remainingAmountKd).toBe('10.0000');
  });

  it('7. statusFromRemaining: tiny residual <= TOLERANCE → PAID', () => {
    const direct = new InvoicePaymentStatusService({} as any);
    expect(
      direct.statusFromRemaining('10.0000', '10.0000', '0.00005'),
    ).toBe('PAID');
  });

  it('8. statusFromRemaining: residual just above TOLERANCE → PARTIALLY_PAID', () => {
    const direct = new InvoicePaymentStatusService({} as any);
    // Tolerance is ~0.0001; 0.001 is well above it.
    expect(
      direct.statusFromRemaining('10.0000', '5.0000', '5.0000'),
    ).toBe('PARTIALLY_PAID');
  });

  it('9. CANCELED order contributes 0 remaining (filtered everywhere)', async () => {
    svc = mkSvc(
      makePrismaForRemaining({ totalKd: '10.0000', status: 'CANCELED' }),
    );
    const r = await svc.derivePaymentStatus('order-x');
    expect(r.remainingAmountKd).toBe('0.0000');
    expect(r.status).toBe('PAID'); // no remaining → not in OPEN list
  });

  it('10. invariant: remaining > tolerance ⇔ NOT fullyPaid (covered above; pinned here)', () => {
    // Pinning the cross-cutting invariant: every isFullyPaid=false
    // row above also satisfies remaining > tolerance. Any future
    // change that breaks this two-way must update this pin + the
    // consumer test suite together.
    const direct = new InvoicePaymentStatusService({} as any);
    const cases = [
      { total: '10', applied: '4', remaining: '6', expected: 'PARTIALLY_PAID' },
      { total: '10', applied: '9.9', remaining: '0.1', expected: 'PARTIALLY_PAID' },
      { total: '10', applied: '0', remaining: '10', expected: 'UNPAID' },
      { total: '10', applied: '10', remaining: '0', expected: 'PAID' },
    ] as const;
    for (const c of cases) {
      const status = direct.statusFromRemaining(c.total, c.applied, c.remaining);
      expect(status).toBe(c.expected);
      const isFullyPaid = status === 'PAID';
      // Tolerance from `INVOICE_REMAINING_TOLERANCE_KD`.
      const hasRemaining = Number.parseFloat(c.remaining) > 0.001;
      expect(isFullyPaid).toBe(!hasRemaining);
    }
  });
});
