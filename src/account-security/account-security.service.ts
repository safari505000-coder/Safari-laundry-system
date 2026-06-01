import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditStatus, LoginOutcome, MfaStatus, Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthLoginSucceededEvent } from './account-security.events';
import {
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
} from './totp.util';

/** Staff roles for which MFA is mandated by policy (informational flag only). */
export const MFA_REQUIRED_ROLES = ['OWNER', 'ACCOUNTANT'];

const LOGIN_HISTORY_DEFAULT_LIMIT = 50;

@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // MFA / TOTP
  // ---------------------------------------------------------------------------

  /**
   * Begin (or restart) MFA enrollment. Generates a fresh secret in PENDING
   * state. The secret is only ACTIVE once the user confirms a code.
   */
  async enrollMfa(
    userId: string,
  ): Promise<{ status: string; secret: string; otpauthUri: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const accountName = user?.username ?? userId;
    const secret = generateTotpSecret();
    await this.prisma.userMfaSecret.upsert({
      where: { userId },
      create: { userId, secret, status: MfaStatus.PENDING, recoveryCodes: [] },
      update: { secret, status: MfaStatus.PENDING, recoveryCodes: [], activatedAt: null },
    });
    this.audit(userId, null, 'MFA_ENROLL_STARTED');
    return {
      status: MfaStatus.PENDING,
      secret,
      otpauthUri: buildOtpAuthUri({ secretBase32: secret, accountName }),
    };
  }

  /** Confirm a PENDING enrollment with a TOTP code and activate MFA. */
  async activateMfa(
    userId: string,
    code: string,
  ): Promise<{ status: string; recoveryCodes: string[] }> {
    const record = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    if (!record) {
      throw new BadRequestException('No MFA enrollment in progress. Start enrollment first.');
    }
    if (!verifyTotp(record.secret, code)) {
      this.audit(userId, null, 'MFA_ACTIVATE_FAILED');
      throw new BadRequestException('Invalid authentication code.');
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.userMfaSecret.update({
      where: { userId },
      data: {
        status: MfaStatus.ACTIVE,
        activatedAt: new Date(),
        lastUsedAt: new Date(),
        recoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    });
    this.audit(userId, null, 'MFA_ACTIVATED');
    return { status: MfaStatus.ACTIVE, recoveryCodes };
  }

  /** Disable MFA after re-verifying a valid TOTP or recovery code. */
  async disableMfa(userId: string, code: string): Promise<{ status: string }> {
    const record = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    if (!record || record.status !== MfaStatus.ACTIVE) {
      throw new BadRequestException('MFA is not active for this account.');
    }
    const valid =
      verifyTotp(record.secret, code) ||
      record.recoveryCodes.includes(hashRecoveryCode(code));
    if (!valid) {
      this.audit(userId, null, 'MFA_DISABLE_FAILED');
      throw new BadRequestException('Invalid authentication code.');
    }
    await this.prisma.userMfaSecret.update({
      where: { userId },
      data: { status: MfaStatus.DISABLED, recoveryCodes: [], activatedAt: null },
    });
    this.audit(userId, null, 'MFA_DISABLED');
    return { status: MfaStatus.DISABLED };
  }

  async getMfaStatus(
    userId: string,
    role: string | null,
  ): Promise<{
    status: string;
    activatedAt: string | null;
    recoveryCodesRemaining: number;
    required: boolean;
  }> {
    const record = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    return {
      status: record?.status ?? 'NONE',
      activatedAt: record?.activatedAt?.toISOString() ?? null,
      recoveryCodesRemaining: record?.recoveryCodes.length ?? 0,
      required: role ? MFA_REQUIRED_ROLES.includes(role.toUpperCase()) : false,
    };
  }

  /**
   * Verify an MFA code at login time. Accepts a TOTP code or an unused
   * recovery code (which is then consumed). Returns false when MFA is not
   * active (caller decides enforcement). Never throws.
   */
  async verifyMfaCode(userId: string, code: string): Promise<boolean> {
    const record = await this.prisma.userMfaSecret.findUnique({ where: { userId } });
    if (!record || record.status !== MfaStatus.ACTIVE) {
      return false;
    }
    if (verifyTotp(record.secret, code)) {
      await this.prisma.userMfaSecret
        .update({ where: { userId }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return true;
    }
    const hashed = hashRecoveryCode(code);
    if (record.recoveryCodes.includes(hashed)) {
      await this.prisma.userMfaSecret
        .update({
          where: { userId },
          data: {
            lastUsedAt: new Date(),
            recoveryCodes: record.recoveryCodes.filter((c) => c !== hashed),
          },
        })
        .catch(() => undefined);
      return true;
    }
    return false;
  }

  async isMfaActive(userId: string): Promise<boolean> {
    const record = await this.prisma.userMfaSecret.findUnique({
      where: { userId },
      select: { status: true },
    });
    return record?.status === MfaStatus.ACTIVE;
  }

  // ---------------------------------------------------------------------------
  // Sessions / forced logout
  // ---------------------------------------------------------------------------

  async listSessions(userId: string): Promise<
    Array<{
      id: string;
      deviceId: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: string;
      lastSeenAt: string;
      expiresAt: string | null;
      current: boolean;
    }>
  > {
    const now = new Date();
    const rows = await this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.deviceId,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      current: false,
    }));
  }

  /** Forced logout of a single session owned by the user. */
  async revokeSession(userId: string, sessionId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'FORCED_LOGOUT' },
    });
    if (result.count === 0) {
      throw new NotFoundException('Active session not found.');
    }
    this.audit(userId, null, 'SESSION_REVOKED', { sessionId });
    return { revoked: result.count };
  }

  /** Forced logout of every active session for the user (optionally keep one). */
  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<{ revoked: number }> {
    const where: Prisma.UserSessionWhereInput = { userId, revokedAt: null };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }
    const result = await this.prisma.userSession.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: 'FORCED_LOGOUT_ALL' },
    });
    this.audit(userId, null, 'SESSION_REVOKED_ALL', { revoked: result.count });
    return { revoked: result.count };
  }

  // ---------------------------------------------------------------------------
  // Devices / login history
  // ---------------------------------------------------------------------------

  async listDevices(userId: string) {
    const rows = await this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      label: d.label,
      platform: d.platform,
      lastIp: d.lastIp,
      trusted: d.trusted,
      firstSeenAt: d.firstSeenAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
    }));
  }

  async setDeviceTrust(userId: string, deviceId: string, trusted: boolean, label?: string) {
    const existing = await this.prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    if (!existing) {
      throw new NotFoundException('Device not found for this account.');
    }
    await this.prisma.userDevice.update({
      where: { userId_deviceId: { userId, deviceId } },
      data: { trusted, ...(label ? { label } : {}) },
    });
    this.audit(userId, null, trusted ? 'DEVICE_TRUSTED' : 'DEVICE_UNTRUSTED', { deviceId });
    return { deviceId, trusted };
  }

  async listLoginHistory(userId: string, limit = LOGIN_HISTORY_DEFAULT_LIMIT) {
    const rows = await this.prisma.userLoginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((h) => ({
      id: h.id,
      outcome: h.outcome,
      reason: h.reason,
      ipAddress: h.ipAddress,
      userAgent: h.userAgent,
      deviceId: h.deviceId,
      mfaUsed: h.mfaUsed,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Event-sourced login capture (fired from AuthService, fully guarded)
  // ---------------------------------------------------------------------------

  /**
   * Record a successful login: history row + device upsert + session row.
   * Designed to never throw into the auth flow (best-effort).
   */
  async recordSuccessfulLogin(event: AuthLoginSucceededEvent): Promise<void> {
    try {
      await this.prisma.userLoginHistory.create({
        data: {
          userId: event.userId,
          username: event.username ?? null,
          role: event.role ?? null,
          outcome: LoginOutcome.SUCCESS,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          deviceId: event.deviceId ?? null,
          mfaUsed: event.mfaUsed ?? false,
        },
      });

      if (event.deviceId) {
        await this.prisma.userDevice.upsert({
          where: { userId_deviceId: { userId: event.userId, deviceId: event.deviceId } },
          create: {
            userId: event.userId,
            deviceId: event.deviceId,
            lastIp: event.ipAddress ?? null,
            lastUserAgent: event.userAgent ?? null,
          },
          update: {
            lastIp: event.ipAddress ?? null,
            lastUserAgent: event.userAgent ?? null,
            lastSeenAt: new Date(),
          },
        });
      }

      await this.prisma.userSession.create({
        data: {
          userId: event.userId,
          tokenHash: event.tokenHash ?? null,
          deviceId: event.deviceId ?? null,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          expiresAt: event.expiresAt ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `login_capture_failed user=${event.userId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Record a failed login attempt (best-effort, never throws). */
  async recordFailedLogin(input: {
    userId?: string | null;
    username?: string | null;
    role?: string | null;
    outcome?: LoginOutcome;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceId?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.userLoginHistory.create({
        data: {
          userId: input.userId ?? null,
          username: input.username ?? null,
          role: input.role ?? null,
          outcome: input.outcome ?? LoginOutcome.FAILURE,
          reason: input.reason ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          deviceId: input.deviceId ?? null,
        },
      });
    } catch {
      // best-effort
    }
  }

  private audit(
    userId: string,
    role: string | null,
    action: string,
    changes?: Record<string, unknown>,
  ): void {
    this.auditLogs.log({
      userId,
      role,
      action,
      resource: 'account_security',
      status: AuditStatus.SUCCESS,
      changes: changes ?? {},
    });
  }
}
