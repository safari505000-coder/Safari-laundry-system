import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { AuditStatus } from '@prisma/client';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { APP_BRAND } from '../common/constants/branding';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Public } from './decorators/roles.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import {
  RefreshTokenRequestDto,
  RefreshTokenResponseDto,
} from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
@Public('Authentication endpoints must be reachable before a JWT exists.')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Post('login')
  // 5 login attempts per IP per minute (brute-force defence). Override via
  // `AUTH_LOGIN_THROTTLE_LIMIT` — load tests run all VUs from 127.0.0.1 so
  // they bump the ceiling; production keeps the default.
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
