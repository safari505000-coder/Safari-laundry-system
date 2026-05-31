import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { AuditStatus } from '@prisma/client';
import { AuditSecurityGuard } from './audit-security.guard';
import { AuditLogsService } from './audit-logs.service';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    originalUrl: '/api/orders/collections/unpaid-online',
    url: '/api/orders/collections/unpaid-online',
    method: 'GET',
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    headers: {
      'user-agent': 'jest',
      'x-request-id': 'req-1',
    },
    requestId: 'req-1',
    user: {
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'DRIVER',
    },
    ...overrides,
  } as any;
}

function makeContext(req = makeReq()) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as any;
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeService() {
  const prisma: any = {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Advisory-lock acquisition inside appendChained's transaction.
    $executeRaw: jest.fn().mockResolvedValue(1),
    // Run the interactive transaction callback against the same mock so the
    // serialized append still hits the asserted auditLog.create mock.
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  const discordAlerts = {
    enqueue: jest.fn(),
  };
  const forbidden: Array<{ at: number; endpoint: string }> = [];
  const blocked = new Set<string>();
  let ipHits = 0;
  const securityState = {
    isBlocked: jest.fn(async (keys: string[]) => keys.some((key) => blocked.has(key))),
    block: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => blocked.add(key));
    }),
    incrementWindow: jest.fn(async () => {
      ipHits += 1;
      return ipHits;
    }),
    addForbiddenAttempt: jest.fn(async (_key: string, endpoint: string) => {
      forbidden.push({ at: Date.now(), endpoint });
      return [...forbidden];
    }),
    forbiddenAttempts: jest.fn(async () => [...forbidden]),
    acquireCooldown: jest.fn(async () => true),
  };
  const service = new AuditLogsService(
    prisma as any,
    discordAlerts as any,
    securityState as any,
  );
  return { service, prisma, discordAlerts, securityState };
}

describe('bank-grade audit security layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs 403 attempts as DENIED audit records', async () => {
    const { service, prisma } = makeService();

    service.logRequest(makeReq(), 403);
    await flushPromises();
    await flushPromises();

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACCESS_COLLECTIONS',
        status: AuditStatus.DENIED,
        endpoint: '/api/orders/collections/unpaid-online',
        role: 'DRIVER',
        requestId: 'req-1',
      }),
    });
  });

  it('triggers suspicious detection after forbidden threshold', async () => {
    const { service, discordAlerts } = makeService();

    for (let i = 0; i < 5; i += 1) {
      service.logRequest(makeReq({ requestId: `req-${i}` }), 403);
    }
    await flushPromises();
    await flushPromises();

    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'suspicious_activity_detected',
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        role: 'DRIVER',
        attempts: 5,
        ip: '10.0.0.1',
      }),
    );
  });

  it('returns 429 when sensitive endpoint IP rate limit is exceeded', async () => {
    const { service } = makeService();
    const guard = new AuditSecurityGuard(service);

    for (let i = 0; i < 10; i += 1) {
      await expect(
        guard.canActivate(makeContext(makeReq({ requestId: `ok-${i}` }))),
      ).resolves.toBe(
        true,
      );
    }

    try {
      await guard.canActivate(makeContext(makeReq({ requestId: 'blocked-1' })));
      fail('Expected rate limit to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('applies temporary block after continued suspicious behavior', async () => {
    const { service, discordAlerts } = makeService();
    const guard = new AuditSecurityGuard(service);
    const req = makeReq();

    for (let i = 0; i < 8; i += 1) {
      service.logRequest(makeReq({ requestId: `forbidden-${i}` }), 403);
    }
    await flushPromises();
    await flushPromises();

    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'temporary_block_applied',
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('enqueues alerts without awaiting alert delivery', async () => {
    const { service, discordAlerts } = makeService();
    discordAlerts.enqueue.mockImplementation(() => undefined);

    service.logRequest(makeReq(), 403);
    service.logRequest(makeReq({ originalUrl: '/api/admin/users' }), 403);
    await flushPromises();
    await flushPromises();

    expect(discordAlerts.enqueue).toHaveBeenCalledWith(
      'suspicious_activity_detected',
      expect.objectContaining({
        endpoint: '/api/admin/users',
        requestId: 'req-1',
      }),
    );
  });

  it('lists audit timeline and filters driverId from payload/changes', async () => {
    const { service, prisma } = makeService();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        action: 'PAYMENT_MADE',
        amount: { toFixed: () => '1.5000' },
        source: 'POS',
        userId: 'user-1',
        timestamp: new Date('2026-05-02T00:00:00.000Z'),
        payload: { driverId: 'driver-1' },
        changes: {},
      },
      {
        action: 'ORDER_CREATED',
        amount: null,
        source: null,
        userId: 'user-2',
        timestamp: new Date('2026-05-01T00:00:00.000Z'),
        payload: { driverId: 'driver-2' },
        changes: {},
      },
    ]);

    const result = await service.listTimeline({ driverId: 'driver-1' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { timestamp: 'desc' },
        take: 500,
      }),
    );
    expect(result.rows).toEqual([
      {
        action: 'PAYMENT_MADE',
        amount: '1.5000',
        source: 'POS',
        userId: 'user-1',
        timestamp: '2026-05-02T00:00:00.000Z',
      },
    ]);
  });

  it('serializes appends behind an advisory lock and reads prevHash deterministically', async () => {
    const { service, prisma } = makeService();

    service.log({
      action: 'PAYMENT_MADE',
      resource: 'financial_event',
      status: AuditStatus.SUCCESS,
    });
    await flushPromises();
    await flushPromises();

    // The chain append must run inside a transaction that first takes the lock.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // Deterministic "latest row" ordering: createdAt then id (tiebreak).
    expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { hash: true },
    });
    // First-ever row chains from GENESIS with a computed hash.
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        prevHash: 'GENESIS',
        hash: expect.any(String),
      }),
    });
  });

  it('verifies the chain with the same deterministic ordering used on append', async () => {
    const { service, prisma } = makeService();

    await service.verifyAuditIntegrity();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, payload: true, hash: true, prevHash: true },
    });
  });
});
