import { CustomerPortalAuthService } from './customer-portal-auth.service';

describe('CustomerPortalAuthService security flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('disables dev login in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CUSTOMER_PORTAL_DEV_LOGIN;

    expect(CustomerPortalAuthService.devLoginEnabled()).toBe(false);
  });

  it('allows dev login in production only when CUSTOMER_PORTAL_DEV_LOGIN=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.CUSTOMER_PORTAL_DEV_LOGIN = 'true';

    expect(CustomerPortalAuthService.devLoginEnabled()).toBe(true);
  });

  it('disables phone preview in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW;

    expect(CustomerPortalAuthService.phonePreviewEnabled()).toBe(false);
  });

  it('allows phone preview in production only when PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW = 'true';

    expect(CustomerPortalAuthService.phonePreviewEnabled()).toBe(true);
  });
});

describe('CustomerPortalAuthService refresh-token rotation', () => {
  function makeService() {
    const prisma: any = {
      customerRefreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const jwt = {
      signAsync: jest.fn(async () => 'customer-access-token'),
    };
    const notifications = {};
    const service = new CustomerPortalAuthService(
      prisma,
      jwt as any,
      notifications as any,
    );
    return { service, prisma, jwt };
  }

  it('rotates a valid customer refresh token and marks the old token used', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.customerRefreshToken.findUnique.mockResolvedValue({
      id: 'old-token-id',
      customerId: 'customer-1',
      tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      revokedAt: null,
      customer: { id: 'customer-1' },
    });
    prisma.customerRefreshToken.create.mockResolvedValue({
      id: 'new-token-id',
    });

    const result = await service.refreshCustomerAccessToken(
      'raw-refresh-token-that-is-long-enough',
    );

    expect(result.accessToken).toBe('customer-access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe('raw-refresh-token-that-is-long-enough');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'customer-1',
        role: 'CUSTOMER',
        linkedCustomerId: 'customer-1',
        tokenPurpose: 'CUSTOMER_PORTAL',
      }),
      expect.objectContaining({ expiresIn: expect.any(String) }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.customerRefreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'customer-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(prisma.customerRefreshToken.update).toHaveBeenCalledWith({
      where: { id: 'old-token-id' },
      data: {
        usedAt: expect.any(Date),
        replacedById: 'new-token-id',
      },
    });
  });

  it('revokes all active customer refresh tokens on replay', async () => {
    const { service, prisma } = makeService();
    prisma.customerRefreshToken.findUnique.mockResolvedValue({
      id: 'old-token-id',
      customerId: 'customer-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      revokedAt: null,
    });

    await expect(
      service.refreshCustomerAccessToken('raw-refresh-token-that-is-long-enough'),
    ).rejects.toThrow('Refresh token replay detected');

    expect(prisma.customerRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.customerRefreshToken.create).not.toHaveBeenCalled();
  });

  it('best-effort revokes a customer refresh token on logout', async () => {
    const { service, prisma } = makeService();
    prisma.customerRefreshToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.revokeCustomerRefreshToken('raw-refresh-token-that-is-long-enough'),
    ).resolves.toBeUndefined();

    expect(prisma.customerRefreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: expect.any(String),
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
