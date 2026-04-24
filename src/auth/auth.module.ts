import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { FinanceModule } from '../finance/finance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatingHoursModule } from '../system/operating-hours.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BcryptService } from './bcrypt.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    FinanceModule,
    OperatingHoursModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ?? 'safari-dev-jwt-secret-change-in-production',
      // V19.12 — access tokens are short-lived (default 15 min); override per
      // call via `jwt.signAsync(payload, { expiresIn })`. Kept as a sane
      // default for anything that does not override.
      signOptions: {
        expiresIn: (process.env.AUTH_ACCESS_TOKEN_TTL ?? '15m') as unknown as number,
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
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService, BcryptService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
