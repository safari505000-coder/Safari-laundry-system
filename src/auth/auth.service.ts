import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SafariRole } from '@prisma/client';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const INSTITUTIONAL_ROLES: readonly SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.MANAGER,
  SafariRole.DRIVER,
  SafariRole.WORKER,
  SafariRole.CALL_CENTER,
  SafariRole.ACCOUNTANT,
  SafariRole.SUPERVISOR,
  SafariRole.VIEWER,
];

@Injectable()
export class AuthService {
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
}
