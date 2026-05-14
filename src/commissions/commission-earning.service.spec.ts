/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for CommissionEarningService.earnForJournalPayment()
 *
 * V20.4 — The Journal-based COLLECTION hook that replaced
 * the legacy earnForDebtPayment(debtEntryId).
 */
import {
  CommissionMode,
  CommissionPayoutStatus,
  CommissionPayoutTiming,
  Prisma,
  SafariRole,
  SystemToggleKey,
} from '@prisma/client';
import { CommissionEarningService } from './commission-earning.service';

// ─── Fixed IDs ────────────────────────────────────────────────────────────────

const JOURNAL_ENTRY_ID = 'je-11111111-1111-4111-8111-111111111111';
const ORDER_ID = 'order-22222222-2222-4222-8222-222222222222';
const DRIVER_ID = 'driver-33333333-3333-4333-8333-333333333333';
const RULE_ID = 'rule-44444444-4444-4444-8444-444444444444';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RULE_ID,
    mode: CommissionMode.COLLECTION,
    isActive: true,
    role: null,
    minInvoiceAmount: new Prisma.Decimal('0'),
    percentage: new Prisma.Decimal('10'),
    payoutTiming: CommissionPayoutTiming.AFTER_COLLECTION,
    ...overrides,
  };
}

function makeJournalEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOURNAL_ENTRY_ID,
    source: 'PAYMENT',
    orderId: ORDER_ID,
    lines: [
      { credit: new Prisma.Decimal('5.0000') }, // CR on account 1300 = cash received
    ],
    ...overrides,
  };
}

function makePrisma() {
  return {
    journalEntry: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    commissionRule: { findMany: jest.fn() },
    commissionPayout: { create: jest.fn(), updateMany: jest.fn() },
  };
}

function makeSettings(enabled = true) {
  return { isEnabled: jest.fn().mockResolvedValue(enabled) };
}

function makePaymentMethodFees() {
  return { getConfig: jest.fn().mockResolvedValue({}) };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  settings: ReturnType<typeof makeSettings>,
  fees: ReturnType<typeof makePaymentMethodFees>,
) {
  return new CommissionEarningService(prisma as any, settings as any, fees as any);
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('CommissionEarningService.earnForJournalPayment()', () => {
  it('creates a COLLECTION payout from JournalEntry AR credit', async () => {
    const prisma = makePrisma();
    const settings = makeSettings(true);
    const fees = makePaymentMethodFees();
    const svc = makeService(prisma, settings, fees);

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([makeRule()]);
    prisma.commissionPayout.create.mockResolvedValue({});

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).toHaveBeenCalledTimes(1);

    const createArg = prisma.commissionPayout.create.mock.calls[0][0].data;
    expect(createArg.mode).toBe(CommissionMode.COLLECTION);
    expect(createArg.earnerUserId).toBe(DRIVER_ID);
    expect(createArg.basisAmount).toBe('5.0000');
    // 5 KD × 10% = 0.5 KD
    expect(createArg.amount).toBe('0.5000');
    expect(createArg.sourceJournalEntryId).toBe(JOURNAL_ENTRY_ID);
    expect(createArg.ruleId).toBe(RULE_ID);
    expect(createArg.status).toBe(CommissionPayoutStatus.PENDING);
    expect(createArg.releasedAt).toBeNull();
  });

  it('payout is RELEASED when rule has IMMEDIATE timing', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([
      makeRule({ payoutTiming: CommissionPayoutTiming.IMMEDIATE }),
    ]);
    prisma.commissionPayout.create.mockResolvedValue({});

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    const createArg = prisma.commissionPayout.create.mock.calls[0][0].data;
    expect(createArg.status).toBe(CommissionPayoutStatus.RELEASED);
    expect(createArg.releasedAt).toBeInstanceOf(Date);
  });

  it('uses transferredFromDriverId over driverId as the earner', async () => {
    const TRANSFERRED_DRIVER = 'transferred-driver-id';
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({
      driverId: DRIVER_ID,
      transferredFromDriverId: TRANSFERRED_DRIVER,
    });
    prisma.user.findUnique.mockResolvedValue({ id: TRANSFERRED_DRIVER, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([makeRule()]);
    prisma.commissionPayout.create.mockResolvedValue({});

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TRANSFERRED_DRIVER } }),
    );
    expect(prisma.commissionPayout.create.mock.calls[0][0].data.earnerUserId).toBe(TRANSFERRED_DRIVER);
  });

  // ─── Idempotency ────────────────────────────────────────────────────────────

  it('handles P2002 (duplicate payout) silently — idempotency', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([makeRule(), makeRule({ id: 'rule-B' })]);

    // First rule: P2002 (already exists) — should be swallowed.
    // Second rule: success.
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    } as any);
    prisma.commissionPayout.create
      .mockRejectedValueOnce(p2002)
      .mockResolvedValueOnce({});

    // Should NOT throw even though first create fails with P2002.
    await expect(svc.earnForJournalPayment(JOURNAL_ENTRY_ID)).resolves.toBeUndefined();
    // Still attempted both rules
    expect(prisma.commissionPayout.create).toHaveBeenCalledTimes(2);
  });

  it('re-throws non-P2002 errors', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([makeRule()]);
    prisma.commissionPayout.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(svc.earnForJournalPayment(JOURNAL_ENTRY_ID)).rejects.toThrow('DB connection lost');
  });

  // ─── COMMISSION toggle OFF ───────────────────────────────────────────────────

  it('no-ops immediately when COMMISSION toggle is disabled', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(false), makePaymentMethodFees());

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    // No DB reads at all — early exit on disabled toggle.
    expect(prisma.journalEntry.findUnique).not.toHaveBeenCalled();
    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('checks SystemToggleKey.COMMISSION — not another toggle', async () => {
    const settings = makeSettings(false);
    const svc = makeService(makePrisma(), settings, makePaymentMethodFees());

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(settings.isEnabled).toHaveBeenCalledWith(SystemToggleKey.COMMISSION);
  });

  // ─── No orderId on JournalEntry ─────────────────────────────────────────────

  it('no-ops when JournalEntry has no orderId', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(
      makeJournalEntry({ orderId: null }),
    );

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when JournalEntry source is not PAYMENT', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(
      makeJournalEntry({ source: 'INVOICE' }),
    );

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when JournalEntry not found', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(null);

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when AR credit (basis) is zero — no real payment', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(
      makeJournalEntry({ lines: [{ credit: new Prisma.Decimal('0') }] }),
    );

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when basis falls below rule minInvoiceAmount', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    // Entry pays 1 KD, but rule requires minimum 5 KD.
    prisma.journalEntry.findUnique.mockResolvedValue(
      makeJournalEntry({ lines: [{ credit: new Prisma.Decimal('1.0000') }] }),
    );
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([
      makeRule({ minInvoiceAmount: new Prisma.Decimal('5') }),
    ]);

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when order has no earner (no driver)', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({
      driverId: null,
      transferredFromDriverId: null,
    });

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('no-ops when no active COLLECTION rules match', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([]); // no rules

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).not.toHaveBeenCalled();
  });

  it('uses role-specific commission rules instead of also applying catch-all rules', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    prisma.journalEntry.findUnique.mockResolvedValue(makeJournalEntry());
    prisma.order.findUnique.mockResolvedValue({ driverId: DRIVER_ID, transferredFromDriverId: null });
    prisma.user.findUnique.mockResolvedValue({ id: DRIVER_ID, safariRole: SafariRole.DRIVER });
    prisma.commissionRule.findMany.mockResolvedValue([
      makeRule({ id: 'catch-all', role: null, percentage: new Prisma.Decimal('3') }),
      makeRule({ id: 'driver-only', role: SafariRole.DRIVER, percentage: new Prisma.Decimal('5') }),
    ]);
    prisma.commissionPayout.create.mockResolvedValue({});

    await svc.earnForJournalPayment(JOURNAL_ENTRY_ID);

    expect(prisma.commissionPayout.create).toHaveBeenCalledTimes(1);
    expect(prisma.commissionPayout.create.mock.calls[0][0].data.ruleId).toBe(
      'driver-only',
    );
  });

  it('cancels commissions using the caller transaction when supplied', async () => {
    const prisma = makePrisma();
    const tx = {
      commissionPayout: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const svc = makeService(prisma, makeSettings(), makePaymentMethodFees());

    const count = await svc.cancelForOrder(ORDER_ID, 'voided', tx as never);

    expect(count).toBe(2);
    expect(tx.commissionPayout.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.commissionPayout.updateMany).not.toHaveBeenCalled();
  });
});
