import { CustomerBlockingService } from './customer-blocking.service';

describe('CustomerBlockingService auto blocking', () => {
  const customer = {
    id: 'customer-1',
    isBlocked: false,
    blockReason: null,
    blockedAt: null,
  };

  function makeService() {
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
        update: jest.fn().mockResolvedValue({
          ...customer,
          isBlocked: true,
          blockReason: 'دين مرتفع',
          blockedAt: new Date('2026-05-02T00:00:00.000Z'),
        }),
      },
    };
    const auditLogs = {
      logFinancialEvent: jest.fn(),
    };
    const service = new CustomerBlockingService(prisma as any, auditLogs as any);
    return { service, prisma, auditLogs };
  }

  it('does not block when canonical totalDueKd is 499', async () => {
    const { service, prisma, auditLogs } = makeService();

    const result = await service.applyAutoBlockFromFinancials('customer-1', '499.0000');

    expect(result).toEqual(customer);
    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(auditLogs.logFinancialEvent).not.toHaveBeenCalled();
  });

  it('blocks when canonical totalDueKd is 501', async () => {
    const { service, prisma, auditLogs } = makeService();
    jest.spyOn(service as any, 'computeTotalDueKd').mockResolvedValue(501);

    const result = await service.applyAutoBlockFromFinancials('customer-1', '501.0000');

    expect(result?.isBlocked).toBe(true);
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: expect.objectContaining({
          isBlocked: true,
          blockReason: 'دين مرتفع',
        }),
      }),
    );
    expect(auditLogs.logFinancialEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CUSTOMER_BLOCKED',
        customerId: 'customer-1',
        source: 'AUTO_HIGH_DEBT',
      }),
    );
  });
});
