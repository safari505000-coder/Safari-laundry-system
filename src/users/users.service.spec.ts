import * as bcrypt from 'bcrypt';
import { AuditStatus, SafariRole } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService password management', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditLogs = { log: jest.fn() };
  const service = new UsersService(
    prisma as never,
    {} as never,
    auditLogs as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  });

  it('resets a password, marks it for forced change, revokes sessions, and audits', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'target-id', safariRole: SafariRole.DRIVER })
      .mockResolvedValueOnce({
        id: 'target-id',
        username: 'driver1',
        fullName: 'Driver One',
        phone: null,
        isActive: true,
        employeeId: null,
        jobTitle: null,
        safariRole: SafariRole.DRIVER,
        roleId: 'role-id',
        branchId: 'branch-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        basicMonthlySalary: null,
        monthlyAllowances: null,
        payrollRosterLineOrder: null,
        bankName: null,
        bankIban: null,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
        role: { id: 'role-id', name: SafariRole.DRIVER },
        branch: null,
      });

    await service.resetPassword(
      'target-id',
      'new-secret',
      'actor-id',
      SafariRole.OWNER,
    );

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-id' },
      data: {
        password: expect.any(String),
        mustChangePassword: true,
        passwordUpdatedAt: expect.any(Date),
      },
    });
    expect(auditLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'actor-id',
        action: 'USER_PASSWORD_RESET',
        status: AuditStatus.SUCCESS,
        changes: { actorUserId: 'actor-id', targetUserId: 'target-id' },
      }),
    );
    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.password).not.toBe('new-secret');
  });

  it('changes own password only when the old password matches', async () => {
    const oldHash = await bcrypt.hash('old-secret', 10);
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-id', password: oldHash })
      .mockResolvedValueOnce({ safariRole: SafariRole.MANAGER });
    prisma.user.update.mockResolvedValue({});

    await service.forceChangePassword('user-id', 'old-secret', 'new-secret');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: {
        password: expect.any(String),
        mustChangePassword: false,
        passwordUpdatedAt: expect.any(Date),
      },
    });
    expect(auditLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        role: SafariRole.MANAGER,
        action: 'USER_PASSWORD_CHANGED',
      }),
    );
  });
});
