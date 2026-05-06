import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { AuditStatus, SafariRole } from '@prisma/client';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { APP_BRAND } from '../common/constants/branding';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CurrentUser, type JwtUser } from './decorators/current-user.decorator';
import { Public } from './decorators/roles.decorator';
import { Roles } from './decorators/roles.decorator';
import { INSTITUTIONAL_ROLES, AuthService } from './auth.service';
import { ChangePasswordBodyDto } from './dto/change-password-body.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import {
  RefreshTokenRequestDto,
  RefreshTokenResponseDto,
} from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
@ApiBearerAuth('bearer')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Public('Login must be reachable before a JWT exists.')
  @Post('login')
  @Throttle({
    default: {
      limit:
        Number.parseInt(process.env.AUTH_LOGIN_THROTTLE_LIMIT ?? '', 10) || 5,
      ttl:
        Number.parseInt(process.env.AUTH_LOGIN_THROTTLE_TTL_MS ?? '', 10) ||
        60_000,
    },
  })
  @ApiOperation({
    summary: `Corporate login (${APP_BRAND})`,
    description:
      'Authenticate with staff username and password. Returns a short-lived access token (15 min) and an opaque refresh token. Initial OWNER is created by `npm run db:seed` (default username `admin`; override with SEED_ADMIN_USERNAME).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<LoginResponseDto> {
    try {
      const res = await this.authService.login(dto);
      if (res.requiresPasswordChange === true && res.tempToken) {
        this.auditLogs.log({
          userId: res.user.id,
          role: res.user.safariRole,
          action: 'LOGIN_PASSWORD_CHANGE_REQUIRED',
          resource: 'auth',
          endpoint: req.originalUrl ?? req.url,
          method: req.method,
          status: AuditStatus.SUCCESS,
          ip: this.ip(req),
          userAgent: this.userAgent(req),
          requestId: req.requestId ?? null,
        });
        return res;
      }
      this.auditLogs.log({
        userId: res.user.id,
        role: res.user.safariRole,
        action: 'LOGIN',
        resource: 'auth',
        endpoint: req.originalUrl ?? req.url,
        method: req.method,
        status: AuditStatus.SUCCESS,
        ip: this.ip(req),
        userAgent: this.userAgent(req),
        requestId: req.requestId ?? null,
      });
      return res;
    } catch (error) {
      this.auditLogs.log({
        action: 'LOGIN',
        resource: 'auth',
        endpoint: req.originalUrl ?? req.url,
        method: req.method,
        status: AuditStatus.DENIED,
        ip: this.ip(req),
        userAgent: this.userAgent(req),
        requestId: req.requestId ?? null,
        suspicious: true,
        changes: { username: dto.username },
      });
      throw error;
    }
  }

  @Public('Refresh-token exchange must work without a valid access JWT.')
  @Post('refresh-token')
  @HttpCode(200)
  @ApiOperation({
    summary: `Refresh access token (${APP_BRAND})`,
    description:
      'Exchange a valid refresh token for a fresh access token. The refresh token is rotated (single-use) — on replay the entire token family for this user is revoked.',
  })
  @ApiOkResponse({ type: RefreshTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Refresh token invalid, expired, revoked, or replayed',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  refresh(
    @Body() dto: RefreshTokenRequestDto,
  ): Promise<RefreshTokenResponseDto> {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Public('Logout revokes refresh tokens without requiring access JWT.')
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: `Revoke refresh token (${APP_BRAND})`,
    description:
      'Best-effort revocation of the supplied refresh token. Always returns 204 so malformed tokens do not reveal whether they existed.',
  })
  async logout(
    @Body() dto: RefreshTokenRequestDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<void> {
    await this.authService.revokeRefreshToken(dto.refreshToken);
    this.auditLogs.log({
      action: 'LOGOUT',
      resource: 'auth',
      endpoint: req.originalUrl ?? req.url,
      method: req.method,
      status: AuditStatus.SUCCESS,
      ip: this.ip(req),
      userAgent: this.userAgent(req),
      requestId: req.requestId ?? null,
    });
  }

  @Post('change-password')
  @Roles(...([...INSTITUTIONAL_ROLES] as SafariRole[]))
  @Throttle({
    default: {
      limit:
        Number.parseInt(
          process.env.AUTH_CHANGE_PASSWORD_THROTTLE_LIMIT ?? '',
          10,
        ) || 10,
      ttl:
        Number.parseInt(
          process.env.AUTH_CHANGE_PASSWORD_THROTTLE_TTL_MS ?? '',
          10,
        ) || 60_000,
    },
  })
  @HttpCode(200)
  @ApiOperation({
    summary: `Change password (${APP_BRAND})`,
    description:
      'Authenticated users (including PASSWORD_CHANGE_ONLY temp JWT after login). Returns a full access + refresh pair on success.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Wrong current password or JWT' })
  async changePassword(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: ChangePasswordBodyDto,
  ): Promise<LoginResponseDto> {
    return this.authService.changePassword(jwtUser.userId, dto);
  }

  private ip(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim() ?? null;
    }
    return req.ip ?? req.socket.remoteAddress ?? null;
  }

  private userAgent(req: Request): string | null {
    const userAgent = req.headers['user-agent'];
    return typeof userAgent === 'string' ? userAgent : null;
  }
}
