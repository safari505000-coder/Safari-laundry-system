import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { APP_BRAND } from '../common/constants/branding';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import {
  RefreshTokenRequestDto,
  RefreshTokenResponseDto,
} from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
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
  async logout(@Body() dto: RefreshTokenRequestDto): Promise<void> {
    await this.authService.revokeRefreshToken(dto.refreshToken);
  }
}
