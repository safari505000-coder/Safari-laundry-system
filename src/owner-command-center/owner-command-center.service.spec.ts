import { OwnerCommandCenterService } from './owner-command-center.service';

function buildPrismaMock() {
  return {
    auditLog: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userSession: { count: jest.fn().mockResolvedValue(0) },
    order: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalPrice: 1234.5 }, _count: 7 }),
    },
    financialSnapshot: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { remainingDebtKd: 500 }, _count: 3 }),
    },
    managerCashCustody: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'PENDING_DEPOSIT', _sum: { amountKd: 80 }, _count: 2 },
        { status: 'VERIFIED', _sum: { amountKd: 40 }, _count: 1 },
      ]),
    },
    bankDepositLog: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'PENDING', _sum: { amountKd: 60 }, _count: 2 },
      ]),
    },
    payroll: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'PENDING', _sum: { basicSalary: 900 }, _count: 4 },
      ]),
    },
    journalFailureLog: { count: jest.fn().mockResolvedValue(1) },
  };
}

const readiness = {
  check: jest.fn().mockResolvedValue({
    ok: true,
    checks: { database: true, redis: true, queue: true },
    region: 'kw',
    deploymentColor: 'blue',
  }),
};

describe('OwnerCommandCenterService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: OwnerCommandCenterService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new OwnerCommandCenterService(prisma as never, readiness as never);
  });

  describe('getSystemHealth', () => {
    it('returns UP statuses and a memory block', async () => {
      const health = await service.getSystemHealth();
      expect(health.database.status).toBe('UP');
      expect(health.redis.status).toBe('UP');
      expect(health.queue.status).toBe('UP');
      expect(health.memory.systemTotalBytes).toBeGreaterThan(0);
      expect(Array.isArray(health.alerts)).toBe(true);
    });

    it('flags DATABASE_DOWN when readiness fails', async () => {
      readiness.check.mockResolvedValueOnce({
        ok: false,
        checks: { database: false, redis: true, queue: true },
        region: 'kw',
        deploymentColor: 'blue',
      });
      const health = await service.getSystemHealth();
      expect(health.database.status).toBe('DOWN');
      expect(health.alerts).toContain('DATABASE_DOWN');
      expect(health.ok).toBe(false);
    });
  });

  describe('getCommandCenter', () => {
    it('aggregates the executive snapshot', async () => {
      const cc = await service.getCommandCenter();
      expect(cc.currency).toBe('KWD');
      expect(cc.dailyRevenue).toEqual({ kd: 1234.5, orders: 7 });
      expect(cc.outstandingDebts).toEqual({ kd: 500, customers: 3 });
      // Outstanding custody excludes VERIFIED/REJECTED buckets.
      expect(cc.driverCustody.outstandingKd).toBe(80);
      expect(cc.pendingDeposits.pendingKd).toBe(60);
      expect(cc.payrollDue.pendingCount).toBe(4);
      expect(cc.failedPayments.last24h).toBe(1);
      expect(cc.systemAlerts.database).toBe('UP');
    });
  });
});
