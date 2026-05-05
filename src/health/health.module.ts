import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { ReadinessService } from './readiness.service';
import { VersionController } from './version.controller';

/**
 * Stage-G — public infrastructure endpoints:
 *   • /api/health  — liveness probe (@nestjs/terminus + Prisma ping)
 *   • /api/version — build identity (package.json version + CI-injected
 *                    git SHA / build time)
 *
 * Both routes are deliberately auth-free so uptime monitors and
 * deployment verifiers can hit them without a pre-shared secret.
 */
@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController, VersionController],
  providers: [PrismaHealthIndicator, ReadinessService],
  exports: [ReadinessService],
})
export class HealthModule {}
