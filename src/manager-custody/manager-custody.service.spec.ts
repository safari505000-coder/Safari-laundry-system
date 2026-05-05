import { Prisma } from '@prisma/client';
import { ManagerCustodyService } from './manager-custody.service';

describe('ManagerCustodyService bank deposit control', () => {
  function makeService(existingDeposit: unknown = null) {
    const row = {
      id: 'custody-1',
      managerId: 'manager-1',
      driverId: 'driver-1',
      branchId: 'branch-1',
      shiftId: 'shift-1',
      amountKd: new Prisma.Decimal('13.7500'),
      settledOrderCount: 3,
      status: 'VERIFIED',
      receivedFromDriverAt: new Date('2026-05-02T08:00:00.000Z'),
      slipUploadedAt: new Date('2026-05-02T09:00:00.000Z'),
      depositSlipUrl: '/uploads/slip.jpg',
      verifiedAt: new Date('2026-05-02T10:00:00.000Z'),
      rejectedAt: null,
      rejectionReason: null,
      note: null,
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      manager: { id: 'manager-1', fullName: 'Manager', username: 'manager', phone: null },
      driver: { id: 'driver-1', fullName: 'Driver', username: 'driver' },
      branch: { id: 'branch-1', name: 'Branch' },
      shift: { id: 'shift-1', startedAt: null, endedAt: null },
    };
    const tx = {
      managerCashCustody: {
        update: jest.fn().mockResolvedValue(row),
      },
      bankDepositLog: {
        findFirst: jest.fn().mockResolvedValue(existingDeposit),
        create: jest.fn().mockResolvedValue({ id: 'deposit-1' }),
        update: jest.fn().mockResolvedValue({ id: 'deposit-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      managerCashCustody: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'custody-1',
          status: 'AWAITING_VERIFICATION',
          note: null,
        }),
      },
      $transaction: jest.fn(async (cb: (db: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const generalLedger = {
      append: jest.fn().mockResolvedValue({ id: 'gl-1' }),
    };
    const auditLogs = {
      log: jest.fn(),
      logFinancialEvent: jest.fn(),
    };
    const ledgerProjection = {
      project: jest.fn().mockResolvedValue([]),
      aggregateAccounts: jest.fn().mockReturnValue([]),
    };
    const service = new ManagerCustodyService(
      prisma as any,
      generalLedger as any,
      {} as any,
      auditLogs as any,
      ledgerProjection as any,
    );
    return { service, prisma, tx, generalLedger, auditLogs, ledgerProjection };
  }

  it('creates and links a verified bank deposit log for a verified custody slip', async () => {
    const { service, tx } = makeService();

    await service.verifyCustody('custody-1', 'accountant-1', {});

    expect(tx.bankDepositLog.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { managerCashCustodyId: 'custody-1' },
          {
            shiftId: 'shift-1',
            receiptImageUrl: '/uploads/slip.jpg',
            amountKd: new Prisma.Decimal('13.7500'),
          },
        ],
      },
    });
    expect(tx.bankDepositLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'VERIFIED',
          managerCashCustodyId: 'custody-1',
          shiftId: 'shift-1',
          amountKd: new Prisma.Decimal('13.7500'),
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CASH_DEPOSIT_REGISTERED',
          resource: 'bank_deposit_log',
        }),
      }),
    );
  });

  it('does not duplicate an existing custody deposit log', async () => {
    const { service, tx } = makeService({
      id: 'deposit-1',
      managerCashCustodyId: 'custody-1',
      verifiedAt: new Date('2026-05-02T10:00:00.000Z'),
      status: 'VERIFIED',
    });

    await service.verifyCustody('custody-1', 'accountant-1', {});

    expect(tx.bankDepositLog.create).not.toHaveBeenCalled();
    expect(tx.bankDepositLog.update).not.toHaveBeenCalled();
  });

  it('emits CASH_DEPOSIT_VERIFIED at the verification boundary in BOTH branches', async () => {
    // Branch A — slip-first (existing deposit row): no auto-create, but
    // the boundary event must still fire once per VERIFIED bag so the
    // audit timeline is complete.
    const a = makeService({
      id: 'deposit-1',
      managerCashCustodyId: 'custody-1',
      verifiedAt: new Date('2026-05-02T10:00:00.000Z'),
      status: 'VERIFIED',
    });
    await a.service.verifyCustody('custody-1', 'accountant-1', {});
    expect(a.auditLogs.logFinancialEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CASH_DEPOSIT_VERIFIED',
        userId: 'accountant-1',
        amount: '13.75',
      }),
    );

    // Branch B — auto-create path (no existing deposit row): boundary
    // event must also fire, in addition to the inner-tx
    // CASH_DEPOSIT_REGISTERED that the auto-create already emits.
    const b = makeService(null);
    await b.service.verifyCustody('custody-1', 'accountant-1', {});
    expect(b.auditLogs.logFinancialEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASH_DEPOSIT_VERIFIED' }),
    );
  });

  it('emits CASH_HANDOVER_REJECTED on rejectCustody', async () => {
    const { service, prisma, auditLogs } = makeService();
    (prisma.managerCashCustody.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'custody-1',
      status: 'AWAITING_VERIFICATION',
      note: null,
    });
    const rejectedRow = {
      id: 'custody-1',
      managerId: 'manager-1',
      driverId: 'driver-1',
      branchId: 'branch-1',
      shiftId: 'shift-1',
      amountKd: new Prisma.Decimal('13.7500'),
      settledOrderCount: 3,
      status: 'REJECTED',
      receivedFromDriverAt: new Date('2026-05-02T08:00:00.000Z'),
      slipUploadedAt: new Date('2026-05-02T09:00:00.000Z'),
      depositSlipUrl: '/uploads/slip.jpg',
      verifiedAt: null,
      rejectedAt: new Date('2026-05-02T11:00:00.000Z'),
      rejectionReason: 'amount mismatch',
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      manager: { id: 'manager-1', fullName: 'Manager', username: 'manager', phone: null },
      driver: { id: 'driver-1', fullName: 'Driver', username: 'driver' },
      branch: { id: 'branch-1', name: 'Branch' },
      shift: { id: 'shift-1', startedAt: null, endedAt: null },
    };
    (prisma as any).managerCashCustody.update = jest.fn().mockResolvedValue(rejectedRow);

    await service.rejectCustody('custody-1', 'accountant-1', {
      rejectionReason: 'amount mismatch',
    });

    expect(auditLogs.logFinancialEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CASH_HANDOVER_REJECTED',
        userId: 'accountant-1',
        changes: expect.objectContaining({
          custodyId: 'custody-1',
          managerId: 'manager-1',
          driverId: 'driver-1',
          rejectionReason: 'amount mismatch',
        }),
      }),
    );
  });
});
