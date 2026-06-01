import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { SafariRole } from '@prisma/client';
import {
  AUTH_LOGIN_SUCCEEDED,
  AuthLoginSucceededEvent,
} from '../account-security/account-security.events';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitHour } from '../common/time/kuwait-time';
import { OperatingHoursService } from '../system/operating-hours.service';
import { UsersService } from '../users/users.service';
import {
  generateRefreshTokenRaw,
  sha256Hex,
} from '../common/auth/refresh-token.util';
import { BcryptService } from './bcrypt.service';
import { ChangePasswordBodyDto } from './dto/change-password-body.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';

/** Institutional roles allowed at corporate login and password-change endpoint. */
export const INSTITUTIONAL_ROLES: readonly SafariRole[] = [
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
  SafariRole.CUSTOMER,
];

const FIELD_OPERATOR_ROLES: readonly SafariRole[] = [
  SafariRole.DRIVER,
  SafariRole.MANAGER,
];
const FIELD_OPERATOR_WINDOW_START_HOUR = 7;

/**
 * V19.12 — short access token, long refresh token (both driven by env).
 * V24+ — default access TTL raised from `15m` to `24h` so an operator can
 * keep a single browser tab open through a full working day without the
 * SSE/dashboard streams being torn down by a 401. The refresh-token
 * rotation + replay-detection contract is unchanged.
 */
// Cast to `any` because @nestjs/jwt exposes `StringValue` (branded `ms` type)
// and refuses a plain `string`. At runtime it's the same value.
const ACCESS_TOKEN_TTL: any = process.env.AUTH_ACCESS_TOKEN_TTL ?? '24h';
const PASSWORD_CHANGE_TOKEN_TTL: any =
  process.env.AUTH_PASSWORD_CHANGE_TOKEN_TTL ?? '15m';
const REFRESH_TOKEN_DAYS = Number.parseInt(
  process.env.AUTH_REFRESH_TOKEN_DAYS ?? '7',
  10,
);

function isWorkingHoursBypassed(): boolean {
  const raw = (process.env.AUTH_BYPASS_WORKING_HOURS ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

type UserAuthRow = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  safariRole: SafariRole;
  branchId: string | null;
  linkedCustomerId: string | null;
  password: string;
  mustChangePassword: boolean;
  role: { name: SafariRole };
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly financeService: FinanceService,
    private readonly bcryptService: BcryptService,
    private readonly operatingHours: OperatingHoursService,
    private readonly usersService: UsersService,
    /**
     * V10: optional so existing manual instantiations / tests keep working.
     * Used only to emit a fire-and-forget login event for security capture.
     */
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /**
   * يسجّل دخول المستخدمين المصرّح لهم مؤسسياً، ويفرض نافذة العمل للسائقين والمديرين عند تفعيلها.
   * Authenticates institution-approved roles and enforces field-operator working-hours rules when enabled.
   * @param dto - بيانات اسم المستخدم وكلمة المرور / Login username and password payload
   * @returns جلسة دخول أو توكن مؤقت لتغيير كلمة المرور / Authenticated session or password-change-only token
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const handle = dto.username.trim();
    const user =
      (await this.prisma.user.findUnique({
        where: { username: handle },
        include: { role: true },
      })) ??
      (await this.prisma.user.findUnique({
        where: { employeeId: handle },
        include: { role: true },
      }));
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
    if (
      FIELD_OPERATOR_ROLES.includes(roleName) &&
      this.operatingHours.isLockEnabled()
    ) {
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
    if (roleName === SafariRole.CUSTOMER && !user.linkedCustomerId?.trim()) {
      throw new UnauthorizedException(
        'Customer portal account is not linked to a customer profile',
      );
    }
    if (user.safariRole !== roleName) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { safariRole: roleName },
      });
    }

    const authUser = user as UserAuthRow;

    if (authUser.mustChangePassword === true) {
      const payload: JwtPayload = {
        sub: user.id,
        role: roleName,
        branchId: user.branchId ?? undefined,
        linkedCustomerId: user.linkedCustomerId ?? undefined,
        tokenPurpose: 'PASSWORD_CHANGE_ONLY',
      };
      const tempToken = await this.jwt.signAsync(payload, {
        expiresIn: PASSWORD_CHANGE_TOKEN_TTL,
      });
      return {
        requiresPasswordChange: true,
        tempToken,
        user: this.buildLoginUserDto(authUser, roleName),
      };
    }

    return this.issueAuthenticatedSession(authUser, roleName);
  }

  /**
   * يغيّر المستخدم كلمة مروره بنفسه ثم يصدر جلسة دخول جديدة إذا بقي الحساب فعالاً.
   * Lets the authenticated user change their own password and issues a fresh session when the account remains active.
   * @param userId - معرف المستخدم الحالي / Current authenticated user id
   * @param dto - كلمة المرور الحالية والجديدة / Current and new password payload
   * @returns جلسة دخول جديدة بعد نجاح التغيير / Fresh login session after the password is changed
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordBodyDto,
  ): Promise<LoginResponseDto> {
    await this.usersService.forceChangePassword(
      userId,
      dto.oldPassword,
      dto.newPassword,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if ((user as { isActive?: boolean }).isActive === false) {
      throw new UnauthorizedException('This account is deactivated');
    }
    const roleName = user.role.name as SafariRole;
    return this.issueAuthenticatedSession(user as UserAuthRow, roleName);
  }

  /**
   * يدوّر refresh token صالحاً ويصدر access token جديداً مع كشف إعادة الاستخدام وإلغاء الجلسات عند الاشتباه.
   * Rotates a valid refresh token, issues a new access token, and detects replay by revoking active sessions.
   * @param rawToken - رمز التحديث الخام من العميل / Raw refresh token presented by the client
   * @returns access token و refresh token جديدان / Newly issued access and refresh tokens
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
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `[AUTH] refresh-token replay detected for user ${row.userId}; revoking all sessions.`,
      );
      throw new UnauthorizedException('Refresh token replay detected');
    }

    const user = row.user as UserAuthRow;
    if ((user as { isActive?: boolean }).isActive === false) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('This account is deactivated');
    }

    if (user.mustChangePassword === true) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        statusCode: 401,
        message:
          'Password change is required — sign in with username and temporary password, then complete change-password.',
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    const roleName = user.role.name as SafariRole;
    const payload: JwtPayload = {
      sub: user.id,
      role: roleName,
      branchId: user.branchId ?? undefined,
      linkedCustomerId: user.linkedCustomerId ?? undefined,
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

  /**
   * يلغي refresh token محدداً عند تسجيل الخروج دون كشف وجوده للعميل.
   * Revokes a specific refresh token during logout without leaking whether it existed.
   * @param rawToken - رمز التحديث الخام المراد إلغاؤه / Raw refresh token to revoke
   * @returns لا تُرجع قيمة / No return value
   */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private buildLoginUserDto(
    user: Pick<
      UserAuthRow,
      | 'id'
      | 'username'
      | 'fullName'
      | 'phone'
      | 'branchId'
      | 'linkedCustomerId'
    >,
    roleName: SafariRole,
  ) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      safariRole: roleName,
      branchId: user.branchId,
      linkedCustomerId: user.linkedCustomerId,
    };
  }

  private async issueAuthenticatedSession(
    user: UserAuthRow,
    roleName: SafariRole,
  ): Promise<LoginResponseDto> {
    if (roleName === SafariRole.DRIVER) {
      await this.financeService.ensureOpenShiftForDriver(user.id);
    }
    const payload: JwtPayload = {
      sub: user.id,
      role: roleName,
      branchId: user.branchId ?? undefined,
      linkedCustomerId: user.linkedCustomerId ?? undefined,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = await this.issueRefreshToken(user.id);
    this.emitLoginSucceeded(user, roleName, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: this.buildLoginUserDto(user, roleName),
    };
  }

  /**
   * V10 — fire-and-forget login capture. Fully guarded so it can never
   * affect the login response. Consumed by AccountSecurityLoginListener.
   */
  private emitLoginSucceeded(
    user: UserAuthRow,
    roleName: SafariRole,
    refreshToken: string,
  ): void {
    try {
      const event: AuthLoginSucceededEvent = {
        userId: user.id,
        username: (user as { username?: string | null }).username ?? null,
        role: roleName,
        mfaUsed: false,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      };
      this.events?.emit(AUTH_LOGIN_SUCCEEDED, event);
    } catch (error) {
      this.logger.warn(
        `[AUTH] login-capture emit failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
