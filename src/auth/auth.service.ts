import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SafariRole } from '@prisma/client';
import * as crypto from 'node:crypto';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitHour } from '../common/time/kuwait-time';
import { OperatingHoursService } from '../system/operating-hours.service';
import { BcryptService } from './bcrypt.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const INSTITUTIONAL_ROLES: readonly SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.DRIVER,
  SafariRole.WORKER,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.FLEET_SUPERVISOR,
  SafariRole.ACCOUNTANT,
  SafariRole.SUPERVISOR,
  SafariRole.VIEWER,
];

const FIELD_OPERATOR_ROLES: readonly SafariRole[] = [
  SafariRole.DRIVER,
  SafariRole.MANAGER,
];
const FIELD_OPERATOR_WINDOW_START_HOUR = 7;

/** V19.12 — short access token, long refresh token (both driven by env). */
// Cast to `any` because @nestjs/jwt exposes `StringValue` (branded `ms` type)
// and refuses a plain `string`. At runtime it's the same value.
const ACCESS_TOKEN_TTL: any = process.env.AUTH_ACCESS_TOKEN_TTL ?? '15m';
const REFRESH_TOKEN_DAYS = Number.parseInt(
  process.env.AUTH_REFRESH_TOKEN_DAYS ?? '7',
  10,
);

function isWorkingHoursBypassed(): boolean {
  const raw = (process.env.AUTH_BYPASS_WORKING_HOURS ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateRefreshTokenRaw(): string {
  // 48 random bytes → 64-char base64url; gives ~384 bits of entropy.
  return crypto.randomBytes(48).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly financeService: FinanceService,
    private readonly bcryptService: BcryptService,
    private readonly operatingHours: OperatingHoursService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const username = dto.username.trim();
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if ((user as { isActive?: boolean }).isActive === false) {
      throw new UnauthorizedException('This account is deactivated');
    }
    const ok = await this.bcryptService.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const roleName = user.role.name as SafariRole;
    if (!INSTITUTIONAL_ROLES.includes(roleName)) {
      throw new UnauthorizedException('Account role is not authorized');
    }
    if (FIELD_OPERATOR_ROLES.includes(roleName) && this.operatingHours.isLockEnabled()) {
      const hour = kuwaitHour(new Date());
      const bypass = isWorkingHoursBypassed();
      if (hour < FIELD_OPERATOR_WINDOW_START_HOUR && !bypass) {
        this.recordOutsideHoursAudit(user.id, roleName, hour).catch((err) => {
          this.logger.warn(
            `[AUTH] failed to record OUTSIDE_WORKING_HOURS audit for ${user.id}: ${String(err)}`,
          );
        });
        throw new UnauthorizedException({
          statusCode: 401,
          message:
            'Login is allowed only between 07:00 and 23:59 Kuwait time for drivers and branch managers.',
          errorCode: 'OUTSIDE_WORKING_HOURS',
        });
      }
      if (hour < FIELD_OPERATOR_WINDOW_START_HOUR && bypass) {
        this.logger.warn(
          `[AUTH] working-hours bypass active — ${roleName} ${user.username} ` +
            `logged in at Kuwait hour ${hour}. Disable AUTH_BYPASS_WORKING_HOURS after diagnostics.`,
        );
      }
    }
    if (user.safariRole !== roleName) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { safariRole: roleName },
      });
    }
    if (roleName === SafariRole.DRIVER) {
      await this.financeService.ensureOpenShiftForDriver(user.id);
    }
    const payload: JwtPayload = {
      sub: user.id,
      role: roleName,
      branchId: user.branchId ?? undefined,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        safariRole: roleName,
        branchId: user.branchId,
      },
    };
  }

  /**
   * V19.12 — refresh-token rotation.
   *   1. Look up stored hash; reject if missing / expired / revoked.
   *   2. If the token was already used → REPLAY: revoke the entire family
   *      for this user (logout-all-sessions defence).
   *   3. Otherwise stamp `usedAt`, issue a fresh refresh token row linked via
   *      `replacedById`, and return a fresh access token with no bcrypt.
   */
  async refreshAccessToken(
    rawToken: string,
  ): Promise<RefreshTokenResponseDto> {
    const tokenHash = sha256Hex(rawToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });
    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (row.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (row.usedAt) {
      // replay detected — revoke every outstanding token for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `[AUTH] refresh-token replay detected for user ${row.userId}; revoking all sessions.`,
      );
      throw new UnauthorizedException('Refresh token replay detected');
    }

    const user = row.user;
    if ((user as { isActive?: boolean }).isActive === false) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('This account is deactivated');
    }

    const roleName = user.role.name as SafariRole;
    const payload: JwtPayload = {
      sub: user.id,
      role: roleName,
      branchId: user.branchId ?? undefined,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const newRaw = generateRefreshTokenRaw();
    const newHash = sha256Hex(newRaw);
    const newExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
        },
      }),
      this.prisma.refreshToken.update({
        where: { id: row.id },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);

    return { accessToken, refreshToken: newRaw };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = generateRefreshTokenRaw();
    const hash = sha256Hex(raw);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hash, expiresAt },
    });
    return raw;
  }

  private async recordOutsideHoursAudit(
    userId: string,
    role: SafariRole,
    kuwaitHourValue: number,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'OUTSIDE_WORKING_HOURS',
        resource: '/api/auth/login',
        changes: {
          role,
          kuwaitHour: kuwaitHourValue,
          kuwaitTime: new Date().toLocaleString('en-GB', {
            timeZone: 'Asia/Kuwait',
            hour12: false,
          }),
        },
      },
    });
  }
}
