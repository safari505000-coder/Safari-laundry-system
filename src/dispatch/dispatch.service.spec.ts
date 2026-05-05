import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispatchStatus, SafariRole } from '@prisma/client';
import {
  computeElapsedMinutes,
  DispatchService,
  severityFor,
} from './dispatch.service';
import type { OrderCreatedEventPayload } from './dispatch.events';

/**
 * V19.x — DispatchService unit suite.
 *
 * Scope (intentionally narrow):
 *   - Block-check semantics on `create()` (Customer.isBlocked must
 *     refuse with 403 CUSTOMER_BLOCKED).
 *   - Driver-role validation on `create()` (must reject non-DRIVER).
 *   - Severity / elapsed math (the only piece of "logic" in the
 *     dispatch read path).
 *   - Auto-completion idempotency on `handleOrderCreated()` (no-op
 *     when dispatch is already COMPLETED, no audit row).
 *
 * Out of scope: DB integration; covered in the curl smoke harness.
 */

type PrismaMock = {
  customer: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  dispatch: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    groupBy: jest.Mock;
  };
};

function buildService(): {
  service: DispatchService;
  prisma: PrismaMock;
  audit: { log: jest.Mock; logFinancialEvent: jest.Mock };
  events: EventEmitter2;
} {
  const prisma: PrismaMock = {
    customer: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    dispatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  const audit = {
    log: jest.fn(),
    logFinancialEvent: jest.fn(),
  };
  const events = new EventEmitter2();
  const service = new DispatchService(prisma as never, audit as never, events);
  return { service, prisma, audit, events };
}

describe('DispatchService.create — operational invariants', () => {
  test('refuses CUSTOMER_BLOCKED with 403 (no write, no audit)', async () => {
    const { service, prisma, audit } = buildService();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'c1',
      isBlocked: true,
      blockReason: 'دين مرتفع',
      displayName: 'Walk-in',
      phone: '+96599999999',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'd1',
      fullName: 'Driver One',
      username: 'driver1',
      isActive: true,
      safariRole: SafariRole.DRIVER,
    });

    await expect(
      service.create({
        customerId: 'c1',
        driverId: 'd1',
        instructionNote: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dispatch.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('refuses non-DRIVER assignee with 400 DRIVER_ROLE_MISMATCH', async () => {
    const { service, prisma, audit } = buildService();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'c1',
      isBlocked: false,
      blockReason: null,
      displayName: 'Acme Co',
      phone: '+96598888888',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'm1',
      fullName: 'Branch Manager',
      username: 'manager1',
      isActive: true,
      safariRole: SafariRole.MANAGER,
    });

    await expect(
      service.create({
        customerId: 'c1',
        driverId: 'm1',
        instructionNote: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dispatch.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('refuses unknown driver with 404', async () => {
    const { service, prisma } = buildService();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'c1',
      isBlocked: false,
      blockReason: null,
      displayName: null,
      phone: '+96598888888',
    });
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.create({
        customerId: 'c1',
        driverId: 'd-missing',
        instructionNote: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('happy path: persists ASSIGNED, writes audit, emits dispatch.created event', async () => {
    const { service, prisma, audit, events } = buildService();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'c1',
      isBlocked: false,
      blockReason: null,
      displayName: 'Walk-in',
      phone: '+96597777777',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'd1',
      fullName: 'Driver One',
      username: 'driver1',
      isActive: true,
      safariRole: SafariRole.DRIVER,
    });
    // createdAt = "now" so elapsed math yields ON_TIME deterministically.
    prisma.dispatch.create.mockResolvedValueOnce({
      id: 'disp-1',
      customerId: 'c1',
      driverId: 'd1',
      status: DispatchStatus.ASSIGNED,
      instructionNote: null,
      createdByUserId: 'agent-1',
      createdAt: new Date(),
      completedAt: null,
      completedByOrderId: null,
    });

    let captured: unknown = null;
    events.on('dispatch.created', (payload) => {
      captured = payload;
    });

    const row = await service.create({
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: '   ',
      actorUserId: 'agent-1',
      actorRole: SafariRole.CALL_CENTER,
    });

    expect(prisma.dispatch.create).toHaveBeenCalledWith({
      data: {
        customerId: 'c1',
        driverId: 'd1',
        instructionNote: null,
        createdByUserId: 'agent-1',
      },
    });
    expect(row.status).toBe('ASSIGNED');
    expect(row.severity).toBe('ON_TIME');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPATCH_CREATED' }),
    );
    expect(captured).toMatchObject({ id: 'disp-1', status: 'ASSIGNED' });
  });
});

describe('DispatchService.handleOrderCreated — auto completion', () => {
  test('no-op when payload has no dispatchId', async () => {
    const { service, prisma, audit } = buildService();
    await service.handleOrderCreated({
      orderId: 'o1',
      dispatchId: null,
      actorUserId: 'd1',
      occurredAtIso: new Date().toISOString(),
    } satisfies OrderCreatedEventPayload);
    expect(prisma.dispatch.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('marks ASSIGNED → COMPLETED + audits + emits dispatch.completed once', async () => {
    const { service, prisma, audit, events } = buildService();
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-1',
      customerId: 'c1',
      driverId: 'd1',
      status: DispatchStatus.COMPLETED,
      instructionNote: null,
      createdAt: new Date('2026-05-04T08:00:00Z'),
      completedAt: new Date('2026-05-04T08:30:00Z'),
      completedByOrderId: 'o1',
      customer: { displayName: 'C', phone: '+965' },
      driver: { fullName: 'D', username: 'd' },
    });

    let completedFire = 0;
    events.on('dispatch.completed', () => {
      completedFire += 1;
    });

    await service.handleOrderCreated({
      orderId: 'o1',
      dispatchId: 'disp-1',
      actorUserId: 'd1',
      occurredAtIso: new Date().toISOString(),
    });

    expect(prisma.dispatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'disp-1', status: DispatchStatus.ASSIGNED },
      data: expect.objectContaining({
        status: DispatchStatus.COMPLETED,
        completedByOrderId: 'o1',
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPATCH_COMPLETED' }),
    );
    expect(completedFire).toBe(1);
  });

  test('idempotent: second event for the same dispatch is a silent no-op', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.handleOrderCreated({
      orderId: 'o2',
      dispatchId: 'disp-1',
      actorUserId: 'd1',
      occurredAtIso: new Date().toISOString(),
    });
    expect(prisma.dispatch.findUnique).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('listener never throws, even when DB blows up (financial isolation)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.updateMany.mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.handleOrderCreated({
        orderId: 'o3',
        dispatchId: 'disp-x',
        actorUserId: null,
        occurredAtIso: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe('Severity helpers — pure functions', () => {
  test.each([
    [0, 'ON_TIME'],
    [9, 'ON_TIME'],
    [10, 'LATE'],
    [19, 'LATE'],
    [20, 'CRITICAL'],
    [120, 'CRITICAL'],
  ])('elapsed=%i → %s', (mins, expected) => {
    expect(severityFor(DispatchStatus.ASSIGNED, mins)).toBe(expected);
  });

  test('completed dispatch always reports COMPLETED regardless of elapsed', () => {
    expect(severityFor(DispatchStatus.COMPLETED, 999)).toBe('COMPLETED');
  });

  test('elapsed clamps to 0 on negative skew (clock drift)', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000);
    expect(computeElapsedMinutes(future, now)).toBe(0);
  });

  test('elapsed truncates to whole minutes', () => {
    const start = new Date('2026-05-04T08:00:00Z');
    const end = new Date('2026-05-04T08:11:30Z');
    expect(computeElapsedMinutes(start, end)).toBe(11);
  });
});

// =============================================================================
// V19.x — Auto-escalation / reassign / reconciliation reliability suite.
// =============================================================================

describe('DispatchService.runEscalationOnce — auto escalation', () => {
  test('promotes 30-min-stale dispatch to a successor on a different driver', async () => {
    const { service, prisma, audit } = buildService();
    const oldParent = {
      id: 'disp-old',
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: null,
    };
    prisma.dispatch.findMany.mockResolvedValueOnce([oldParent]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'd2' }]);
    prisma.dispatch.groupBy.mockResolvedValueOnce([]);
    const successorRow = {
      id: 'disp-new',
      customerId: 'c1',
      driverId: 'd2',
      status: DispatchStatus.ASSIGNED,
      instructionNote: 'تصعيد تلقائي بعد 30 دقيقة',
      createdByUserId: null,
      parentDispatchId: 'disp-old',
      createdAt: new Date(),
      completedAt: null,
      completedByOrderId: null,
    };
    prisma.dispatch.create.mockResolvedValueOnce(successorRow);

    const result = await service.runEscalationOnce({ minAgeMinutes: 30 });

    expect(result).toEqual({ inspected: 1, escalated: 1, skipped: 0 });
    expect(prisma.dispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: DispatchStatus.ASSIGNED,
          children: { none: {} },
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.dispatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'c1',
        driverId: 'd2',
        parentDispatchId: 'disp-old',
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPATCH_ESCALATED',
        source: 'AUTO_ESCALATION_CRON',
      }),
    );
  });

  test('idempotent: candidate query already filters parents with children — second tick does nothing', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([]);

    const result = await service.runEscalationOnce({ minAgeMinutes: 30 });

    expect(result).toEqual({ inspected: 0, escalated: 0, skipped: 0 });
    expect(prisma.dispatch.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('skips (no escalate) when no alternate driver is available', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([
      {
        id: 'disp-1',
        customerId: 'c1',
        driverId: 'd1',
        instructionNote: null,
      },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([]); // no other drivers

    const result = await service.runEscalationOnce({ minAgeMinutes: 30 });

    expect(result).toEqual({ inspected: 1, escalated: 0, skipped: 1 });
    expect(prisma.dispatch.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('alternate driver picker prefers the LEAST loaded driver', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'd2' }, { id: 'd3' }]);
    prisma.dispatch.groupBy.mockResolvedValueOnce([
      { driverId: 'd2', _count: { _all: 5 } },
      { driverId: 'd3', _count: { _all: 1 } },
    ]);

    const next = await service.pickAlternateDriver('d1');
    expect(next?.id).toBe('d3');
  });
});

describe('DispatchService.reassign — manual call-center reassign', () => {
  test('rejects when dispatch is missing (404 DISPATCH_NOT_FOUND)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.reassign({
        dispatchId: 'missing',
        newDriverId: 'd2',
        reason: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('rejects when dispatch is already COMPLETED (400 DISPATCH_NOT_ASSIGNED)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-1',
      status: DispatchStatus.COMPLETED,
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: null,
    });
    await expect(
      service.reassign({
        dispatchId: 'disp-1',
        newDriverId: 'd2',
        reason: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('rejects when newDriverId equals current driver (400 DRIVER_UNCHANGED)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-1',
      status: DispatchStatus.ASSIGNED,
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: null,
    });
    await expect(
      service.reassign({
        dispatchId: 'disp-1',
        newDriverId: 'd1',
        reason: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('happy path: creates successor with parentDispatchId + audits DISPATCH_REASSIGNED', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-old',
      status: DispatchStatus.ASSIGNED,
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: 'بريد سريع',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'd2',
      isActive: true,
      safariRole: SafariRole.DRIVER,
    });
    prisma.dispatch.create.mockResolvedValueOnce({
      id: 'disp-new',
      customerId: 'c1',
      driverId: 'd2',
      status: DispatchStatus.ASSIGNED,
      instructionNote: 'لم يصل خلال 25 دقيقة',
      createdByUserId: 'agent-1',
      parentDispatchId: 'disp-old',
      createdAt: new Date(),
      completedAt: null,
      completedByOrderId: null,
    });

    const successor = await service.reassign({
      dispatchId: 'disp-old',
      newDriverId: 'd2',
      reason: 'لم يصل خلال 25 دقيقة',
      actorUserId: 'agent-1',
      actorRole: SafariRole.CALL_CENTER,
    });

    expect(successor.id).toBe('disp-new');
    expect(prisma.dispatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'c1',
        driverId: 'd2',
        parentDispatchId: 'disp-old',
        instructionNote: 'لم يصل خلال 25 دقيقة',
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPATCH_REASSIGNED',
        source: 'CALL_CENTER_MANUAL',
      }),
    );
  });
});

describe('DispatchService.runReconciliationOnce — event-loss safety net', () => {
  test('closes a stuck ASSIGNED dispatch that has a matching Order', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([
      {
        id: 'disp-stuck',
        customerId: 'c1',
        orders: [{ id: 'order-1' }],
      },
    ]);
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.runReconciliationOnce();

    expect(result).toEqual({ inspected: 1, closed: 1 });
    expect(prisma.dispatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'disp-stuck',
        status: DispatchStatus.ASSIGNED,
      },
      data: expect.objectContaining({
        status: DispatchStatus.COMPLETED,
        completedByOrderId: 'order-1',
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPATCH_RECONCILED',
        source: 'RECONCILIATION_CRON',
      }),
    );
  });

  test('idempotent: when updateMany flips 0 rows, NO audit row is written', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([
      {
        id: 'disp-already-closed',
        customerId: 'c1',
        orders: [{ id: 'order-1' }],
      },
    ]);
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.runReconciliationOnce();

    expect(result).toEqual({ inspected: 1, closed: 0 });
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('skips dispatches whose `orders` join is empty (defensive)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([
      {
        id: 'disp-1',
        customerId: 'c1',
        orders: [],
      },
    ]);

    const result = await service.runReconciliationOnce();

    expect(result).toEqual({ inspected: 0, closed: 0 });
    expect(prisma.dispatch.updateMany).not.toHaveBeenCalled();
  });

  test('idempotent on empty cron tick: zero candidates → zero work', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([]);
    const result = await service.runReconciliationOnce();
    expect(result).toEqual({ inspected: 0, closed: 0 });
    expect(prisma.dispatch.updateMany).not.toHaveBeenCalled();
  });
});
