import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountSecurityService } from './account-security.service';
import { generateTotp, generateTotpSecret, hashRecoveryCode } from './totp.util';

type AnyFn = jest.Mock;

function buildPrismaMock() {
  return {
    user: { findUnique: jest.fn() },
    userMfaSecret: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSession: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    userDevice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    userLoginHistory: { findMany: jest.fn(), create: jest.fn() },
  };
}

describe('AccountSecurityService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: { log: AnyFn };
  let service: AccountSecurityService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    audit = { log: jest.fn() };
    service = new AccountSecurityService(prisma as never, audit as never);
  });

  describe('enrollMfa', () => {
    it('creates a PENDING secret and returns an otpauth URI', async () => {
      prisma.user.findUnique.mockResolvedValue({ username: 'owner' });
      prisma.userMfaSecret.upsert.mockResolvedValue({});

      const result = await service.enrollMfa('user-1');

      expect(result.status).toBe('PENDING');
      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
      expect(result.otpauthUri).toContain('otpauth://totp/');
      expect(prisma.userMfaSecret.upsert).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('activateMfa', () => {
    it('activates with a valid code and returns recovery codes', async () => {
      const secret = generateTotpSecret();
      prisma.userMfaSecret.findUnique.mockResolvedValue({ secret, status: 'PENDING' });
      prisma.userMfaSecret.update.mockResolvedValue({});

      const code = generateTotp(secret);
      const result = await service.activateMfa('user-1', code);

      expect(result.status).toBe('ACTIVE');
      expect(result.recoveryCodes).toHaveLength(8);
      expect(prisma.userMfaSecret.update).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid code', async () => {
      const secret = generateTotpSecret();
      prisma.userMfaSecret.findUnique.mockResolvedValue({ secret, status: 'PENDING' });

      await expect(service.activateMfa('user-1', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when no enrollment exists', async () => {
      prisma.userMfaSecret.findUnique.mockResolvedValue(null);
      await expect(service.activateMfa('user-1', '123456')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('verifyMfaCode', () => {
    it('returns true for a valid TOTP on an active secret', async () => {
      const secret = generateTotpSecret();
      prisma.userMfaSecret.findUnique.mockResolvedValue({
        secret,
        status: 'ACTIVE',
        recoveryCodes: [],
      });
      prisma.userMfaSecret.update.mockResolvedValue({});

      expect(await service.verifyMfaCode('user-1', generateTotp(secret))).toBe(true);
    });

    it('consumes a recovery code', async () => {
      const secret = generateTotpSecret();
      const recovery = 'ABCDE-12345';
      prisma.userMfaSecret.findUnique.mockResolvedValue({
        secret,
        status: 'ACTIVE',
        recoveryCodes: [hashRecoveryCode(recovery)],
      });
      prisma.userMfaSecret.update.mockResolvedValue({});

      expect(await service.verifyMfaCode('user-1', recovery)).toBe(true);
      const updateArg = prisma.userMfaSecret.update.mock.calls[0][0];
      expect(updateArg.data.recoveryCodes).toEqual([]);
    });

    it('returns false when MFA is not active', async () => {
      prisma.userMfaSecret.findUnique.mockResolvedValue(null);
      expect(await service.verifyMfaCode('user-1', '123456')).toBe(false);
    });
  });

  describe('sessions', () => {
    it('revokes a single owned session', async () => {
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.revokeSession('user-1', 'sess-1');
      expect(result.revoked).toBe(1);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'sess-1', userId: 'user-1' }),
        }),
      );
    });

    it('throws when no active session matches', async () => {
      prisma.userSession.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revokeSession('user-1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('revokes all sessions except an optional one', async () => {
      prisma.userSession.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.revokeAllSessions('user-1', 'keep-1');
      expect(result.revoked).toBe(3);
    });
  });

  describe('recordSuccessfulLogin', () => {
    it('writes history, device and session and never throws', async () => {
      prisma.userLoginHistory.create.mockResolvedValue({});
      prisma.userDevice.upsert.mockResolvedValue({});
      prisma.userSession.create.mockResolvedValue({});

      await expect(
        service.recordSuccessfulLogin({
          userId: 'user-1',
          role: 'OWNER',
          deviceId: 'dev-1',
          tokenHash: 'hash',
        }),
      ).resolves.toBeUndefined();

      expect(prisma.userLoginHistory.create).toHaveBeenCalled();
      expect(prisma.userDevice.upsert).toHaveBeenCalled();
      expect(prisma.userSession.create).toHaveBeenCalled();
    });

    it('swallows persistence errors', async () => {
      prisma.userLoginHistory.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.recordSuccessfulLogin({ userId: 'user-1' }),
      ).resolves.toBeUndefined();
    });
  });
});
