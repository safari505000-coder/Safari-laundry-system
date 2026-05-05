import { ExecutionContext } from '@nestjs/common';
import { CustomerBlockGuard } from './customer-block.guard';
import type {
  CustomerBlockingService,
  CustomerBlockSnapshot,
} from '../services/customer-blocking.service';

function context(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('CustomerBlockGuard', () => {
  const blockedCustomer: CustomerBlockSnapshot = {
    id: 'customer-1',
    isBlocked: true,
    blockReason: 'دين مرتفع',
    blockedAt: new Date('2026-05-02T00:00:00.000Z'),
  };

  function makeGuard(overrides?: Partial<CustomerBlockingService>) {
    const service = {
      findCustomerForRequest: jest.fn().mockResolvedValue(blockedCustomer),
      canOverrideBlockedCustomer: jest.fn((role: string | null | undefined) =>
        ['MANAGER', 'BRANCH_MANAGER'].includes((role ?? '').toUpperCase()),
      ),
      hasOverrideHeader: jest.fn((req: { headers?: Record<string, string> }) =>
        req.headers?.['x-override-block'] === 'true',
      ),
      logBlockedOverride: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as CustomerBlockingService;
    return {
      guard: new CustomerBlockGuard(service),
      service,
    };
  }

  it('allows requests when the resolved customer is not blocked', async () => {
    const { guard } = makeGuard({
      findCustomerForRequest: jest.fn().mockResolvedValue({
        ...blockedCustomer,
        isBlocked: false,
      }),
    } as Partial<CustomerBlockingService>);

    await expect(
      guard.canActivate(context({ user: { role: 'DRIVER' }, headers: {} })),
    ).resolves.toBe(true);
  });

  it('blocks drivers for blocked customers', async () => {
    const { guard } = makeGuard();

    await expect(
      guard.canActivate(context({ user: { role: 'DRIVER' }, headers: {} })),
    ).rejects.toMatchObject({
      response: {
        message: 'CUSTOMER_BLOCKED',
        errorCode: 'CUSTOMER_BLOCKED',
        blockReason: 'دين مرتفع',
      },
    });
  });

  it('requires the override header for managers', async () => {
    const { guard } = makeGuard();

    await expect(
      guard.canActivate(context({ user: { role: 'MANAGER' }, headers: {} })),
    ).rejects.toMatchObject({
      response: {
        message: 'CUSTOMER_BLOCKED',
        errorCode: 'CUSTOMER_BLOCKED',
        blockReason: 'دين مرتفع',
      },
    });
  });

  it('allows and audits manager override with x-override-block=true', async () => {
    const { guard, service } = makeGuard();
    const req = {
      user: { role: 'MANAGER', userId: 'manager-1' },
      headers: { 'x-override-block': 'true' },
    };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(service.logBlockedOverride).toHaveBeenCalledWith(req, blockedCustomer);
  });
});
