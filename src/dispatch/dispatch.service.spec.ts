import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispatchStatus, SafariRole } from '@prisma/client';
import type { Dispatch } from '@prisma/client';
import {
  computeElapsedMinutes,
  DispatchService,
  severityFor,
  slaToneDispatch,
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
  $transaction: jest.Mock;
  customer: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  dispatch: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
    groupBy: jest.Mock;
  };
};

function buildService(): {
  service: DispatchService;
  prisma: PrismaMock;
  audit: { log: jest.Mock; logFinancialEvent: jest.Mock };
  events: EventEmitter2;
  metrics: {
    incrementAssigned: jest.Mock;
    recordAcknowledged: jest.Mock;
    recordCompletion: jest.Mock;
  };
} {
  const prisma: PrismaMock = {
    $transaction: jest.fn(async (fn: (tx: PrismaMock) => unknown) =>
      fn(prisma),
    ),
    customer: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    dispatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  const audit = {
    log: jest.fn(),
    logFinancialEvent: jest.fn(),
  };
  const events = new EventEmitter2();
  const metrics = {
    incrementAssigned: jest.fn().mockResolvedValue(undefined),
    recordAcknowledged: jest.fn().mockResolvedValue(undefined),
    recordCompletion: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DispatchService(
    prisma as never,
    audit as never,
    events,
    metrics as never,
  );
  return { service, prisma, audit, events, metrics };
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
    prisma.dispatch.findFirst.mockResolvedValueOnce(null);
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

  test('non–call-center actor does not stamp createdByUserId (not a CC dispatch)', async () => {
    const { service, prisma } = buildService();
    prisma.customer.findUnique.mockResolvedValueOnce({
      id: 'c1',
      isBlocked: false,
      blockReason: null,
      displayName: 'Acme',
      phone: '+96598888888',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'd1',
      fullName: 'Driver One',
      username: 'driver1',
      isActive: true,
      safariRole: SafariRole.DRIVER,
    });
    prisma.dispatch.findFirst.mockResolvedValueOnce(null);
    prisma.dispatch.create.mockResolvedValueOnce({
      id: 'disp-owner',
      customerId: 'c1',
      driverId: 'd1',
      status: DispatchStatus.ASSIGNED,
      instructionNote: null,
      createdByUserId: null,
      createdAt: new Date(),
      completedAt: null,
      completedByOrderId: null,
    });

    await service.create({
      customerId: 'c1',
      driverId: 'd1',
      instructionNote: null,
      actorUserId: 'owner-1',
      actorRole: SafariRole.OWNER,
    });

    expect(prisma.dispatch.create).toHaveBeenCalledWith({
      data: {
        customerId: 'c1',
        driverId: 'd1',
        instructionNote: null,
        createdByUserId: null,
      },
    });
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
    prisma.dispatch.findUnique
      .mockResolvedValueOnce({
        id: 'disp-1',
        createdAt: new Date('2026-05-04T08:00:00Z'),
        driverId: 'd1',
        customerId: 'c1',
      })
      .mockResolvedValueOnce({
        id: 'disp-1',
        customerId: 'c1',
        driverId: 'd1',
        status: DispatchStatus.COMPLETED,
        instructionNote: null,
        createdByUserId: null,
        parentDispatchId: null,
        createdAt: new Date('2026-05-04T08:00:00Z'),
        acknowledgedAt: null,
        startedAt: null,
        firstAlertAt: null,
        escalatedAt: null,
        breachedAt: null,
        ackMinutes: null,
        totalMinutes: 90,
        completedAt: new Date('2026-05-04T08:30:00Z'),
        completedByOrderId: 'o1',
        customer: { displayName: 'C', phone: '+965' },
        driver: { fullName: 'D', username: 'd' },
      });
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 1 });

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
      where: {
        id: 'disp-1',
        status: {
          in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS],
        },
      },
      data: expect.objectContaining({
        status: DispatchStatus.COMPLETED,
        completedByOrderId: 'o1',
        totalMinutes: expect.any(Number),
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPATCH_COMPLETED' }),
    );
    expect(completedFire).toBe(1);
  });

  test('idempotent: second event for the same dispatch is a silent no-op', async () => {
    const { service, prisma, audit } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-1',
      createdAt: new Date(),
      driverId: 'd1',
      customerId: 'c1',
    });
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.handleOrderCreated({
      orderId: 'o2',
      dispatchId: 'disp-1',
      actorUserId: 'd1',
      occurredAtIso: new Date().toISOString(),
    });
    expect(prisma.dispatch.findUnique).toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('listener never throws, even when DB blows up (financial isolation)', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findUnique.mockResolvedValueOnce({
      id: 'disp-x',
      createdAt: new Date(),
      driverId: 'd1',
      customerId: 'c1',
    });
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

  test('slaTone — ASSIGNED uses SLA tiers', () => {
    const fresh = {
      status: DispatchStatus.ASSIGNED,
      breachedAt: null,
      escalatedAt: null,
      firstAlertAt: null,
    } as Dispatch;
    expect(slaToneDispatch(fresh, 1)).toBe('NORMAL');
    expect(slaToneDispatch(fresh, 3)).toBe('LATE');
    expect(slaToneDispatch(fresh, 7)).toBe('LATE');
    expect(slaToneDispatch(fresh, 11)).toBe('BREACH');
  });
});

// =============================================================================
// V19.x — SLA monitor / reconciliation reliability suite.
// =============================================================================

describe('DispatchService.runSlaMonitorOnce', () => {
  test('returns zeros when there are no ASSIGNED rows', async () => {
    const { service, prisma } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([]);
    const result = await service.runSlaMonitorOnce({});
    expect(result).toEqual({
      inspected: 0,
      firstAlerts: 0,
      escalations: 0,
      breaches: 0,
    });
  });
});

describe('DispatchService.reassign — disabled', () => {
  test('always rejects with 403 DISPATCH_REASSIGN_FORBIDDEN', async () => {
    const { service } = buildService();
    await expect(
      service.reassign({
        dispatchId: 'disp-1',
        newDriverId: 'd2',
        reason: null,
        actorUserId: 'agent-1',
        actorRole: SafariRole.CALL_CENTER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('DispatchService.runReconciliationOnce — event-loss safety net', () => {
  test('closes a stuck ASSIGNED dispatch that has a matching Order', async () => {
    const { service, prisma, audit, metrics } = buildService();
    prisma.dispatch.findMany.mockResolvedValueOnce([
      {
        id: 'disp-stuck',
        customerId: 'c1',
        orders: [{ id: 'order-1' }],
      },
    ]);
    prisma.dispatch.findUnique
      .mockResolvedValueOnce({
        createdAt: new Date('2026-05-04T08:00:00Z'),
        driverId: 'd1',
      })
      .mockResolvedValueOnce({
        id: 'disp-stuck',
        customerId: 'c1',
        driverId: 'd1',
        status: DispatchStatus.COMPLETED,
        instructionNote: null,
        createdByUserId: null,
        createdAt: new Date('2026-05-04T08:00:00Z'),
        acknowledgedAt: null,
        startedAt: null,
        firstAlertAt: null,
        escalatedAt: null,
        breachedAt: null,
        ackMinutes: null,
        totalMinutes: 120,
        completedAt: new Date(),
        completedByOrderId: 'order-1',
        parentDispatchId: null,
        customer: { displayName: 'C', phone: '+965' },
        driver: { fullName: 'D', username: 'd' },
      });
    prisma.dispatch.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.runReconciliationOnce();

    expect(result).toEqual({ inspected: 1, closed: 1 });
    expect(prisma.dispatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'disp-stuck',
        status: {
          in: [DispatchStatus.ASSIGNED, DispatchStatus.IN_PROGRESS],
        },
      },
      data: expect.objectContaining({
        status: DispatchStatus.COMPLETED,
        completedByOrderId: 'order-1',
        totalMinutes: expect.any(Number),
      }) as unknown,
    });
    expect(metrics.recordCompletion).toHaveBeenCalled();
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

describe('DispatchService.listAvailableDrivers — call-center driver picker', () => {
  test('filters Prisma query to safariRole=DRIVER AND isActive=true', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([]);
    await service.listAvailableDrivers();
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg).toEqual(
      expect.objectContaining({
        where: { safariRole: SafariRole.DRIVER, isActive: true },
        select: expect.objectContaining({
          id: true,
          fullName: true,
          username: true,
          isActive: true,
        }) as unknown,
      }),
    );
    // Defensive: must NEVER select sensitive fields the call-center
    // role is not authorised to see.
    expect(arg.select).not.toHaveProperty('phone');
    expect(arg.select).not.toHaveProperty('roleId');
    expect(arg.select).not.toHaveProperty('linkedCustomerId');
  });

  test('returns [] without a second round-trip when no drivers exist', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([]);
    const out = await service.listAvailableDrivers();
    expect(out).toEqual([]);
    // No drivers ⇒ no point counting their workload.
    expect(prisma.dispatch.groupBy).not.toHaveBeenCalled();
  });

  test('falls back to username when fullName is empty', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'd1', fullName: '   ', username: 'driver1', isActive: true },
    ]);
    prisma.dispatch.groupBy.mockResolvedValueOnce([]);
    const out = await service.listAvailableDrivers();
    expect(out).toEqual([
      { id: 'd1', name: 'driver1', isActive: true, activeLoad: 0 },
    ]);
  });

  test('sorts by ascending workload, ties broken by name', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'd-busy', fullName: 'Busy Driver', username: 'busy', isActive: true },
      { id: 'd-mid', fullName: 'Mid Driver', username: 'mid', isActive: true },
      { id: 'd-free', fullName: 'Anan', username: 'anan', isActive: true },
      { id: 'd-tie', fullName: 'Bilal', username: 'bilal', isActive: true },
    ]);
    prisma.dispatch.groupBy.mockResolvedValueOnce([
      { driverId: 'd-busy', _count: { _all: 5 } },
      { driverId: 'd-mid', _count: { _all: 2 } },
      // d-free and d-tie both have 0 — alphabetical wins.
    ]);

    const out = await service.listAvailableDrivers();
    expect(out.map((r) => r.id)).toEqual(['d-free', 'd-tie', 'd-mid', 'd-busy']);
    expect(out.map((r) => r.activeLoad)).toEqual([0, 0, 2, 5]);
  });

  test('every returned row exposes ONLY {id, name, isActive, activeLoad}', async () => {
    const { service, prisma } = buildService();
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        fullName: 'Driver One',
        username: 'driver1',
        isActive: true,
      },
    ]);
    prisma.dispatch.groupBy.mockResolvedValueOnce([]);
    const [row] = await service.listAvailableDrivers();
    expect(Object.keys(row).sort()).toEqual(
      ['activeLoad', 'id', 'isActive', 'name'].sort(),
    );
  });
});
