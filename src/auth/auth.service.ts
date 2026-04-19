import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SafariRole } from '@prisma/client';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { kuwaitHour } from '../common/time/kuwait-time';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const INSTITUTIONAL_ROLES: readonly SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.MANAGER,
  SafariRole.DRIVER,
  SafariRole.WORKER,
  SafariRole.CALL_CENTER,
  SafariRole.ACCOUNTANT,
  SafariRole.SUPERVISOR,
  SafariRole.VIEWER,
];

/**
 * Field-operator working hours (Asia/Kuwait). Drivers and branch managers can
 * only authenticate between 07:00 and 23:59; the system rejects any attempt
 * in [00:00, 07:00). Executive/back-office roles (OWNER, GENERAL_MANAGER,
 * ACCOUNTANT, CALL_CENTER, SUPERVISOR, VIEWER, WORKER) are not affected —
 * the `OperatingHoursMiddleware` still governs which mutations they can run.
 */
const FIELD_OPERATOR_ROLES: readonly SafariRole[] = [
  SafariRole.DRIVER,
  SafariRole.MANAGER,
];
const FIELD_OPERATOR_WINDOW_START_HOUR = 7;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly financeService: FinanceService,
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
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const roleName = user.role.name as SafariRole;
    if (!INSTITUTIONAL_ROLES.includes(roleName)) {
      throw new UnauthorizedException('Account role is not authorized');
    }
    if (FIELD_OPERATOR_ROLES.includes(roleName)) {
      const hour = kuwaitHour(new Date());
      if (hour < FIELD_OPERATOR_WINDOW_START_HOUR) {
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
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
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
   * Fire-and-forget audit entry for drivers/managers who attempt to log in
   * outside the 07:00–23:59 Kuwait window. Lets the OWNER dashboard surface
   * the count of rejected attempts without interfering with the login path.
   */
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
