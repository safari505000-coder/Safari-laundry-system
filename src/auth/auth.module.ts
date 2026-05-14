/**
 * وحدة المصادقة — تسجّل الحراس العالميين (JWT والأدوار والصلاحيات ومدير الوصول للقراءة فقط).
 * Auth module — registers global guards (JWT, roles, permissions, GM read-only) and exports auth services.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JWT_SECRET_DEV_FALLBACK } from '../common/constants/jwt-secret-fallback';
import { FinanceModule } from '../finance/finance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { OperatingHoursModule } from '../system/operating-hours.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BcryptService } from './bcrypt.service';
import { GeneralManagerReadOnlyGuard } from './guards/general-manager-read-only.guard';
import { PasswordChangeScopeGuard } from './guards/password-change-scope.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './permissions/permissions.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    FinanceModule,
    OperatingHoursModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
      // V19.12 — access tokens are short-lived; override per call via
      // `jwt.signAsync(payload, { expiresIn })`. Default raised in V24+ to
      // 24h to match the operator session expectation (one full working day
      // without forced re-auth). The refresh-token rotation contract is
      // unchanged: `AUTH_REFRESH_TOKEN_DAYS` (default 7 days) still gates the
      // long-lived session, and rotated single-use refresh tokens still trip
      // the replay-detection cascade. Override via `AUTH_ACCESS_TOKEN_TTL`.
      signOptions: {
        expiresIn: (process.env.AUTH_ACCESS_TOKEN_TTL ?? '24h') as unknown as number,
      },
    }),
    // V19.12 — anti brute-force on POST /api/auth/login. The explicit
    // `@Throttle` decorator on the login route (5/min/IP) is the real
    // budget; this global ceiling is deliberately generous so authenticated
    // traffic (reports, order creation, etc.) is never throttled.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: Number.parseInt(process.env.THROTTLE_GLOBAL_LIMIT ?? '0', 10) ||
          Number.MAX_SAFE_INTEGER,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    BcryptService,
    JwtStrategy,
    JwtAuthGuard,
    PasswordChangeScopeGuard,
    GeneralManagerReadOnlyGuard,
    RolesGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PasswordChangeScopeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: GeneralManagerReadOnlyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [
    AuthService,
    BcryptService,
    JwtModule,
    JwtAuthGuard,
    GeneralManagerReadOnlyGuard,
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
