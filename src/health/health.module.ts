import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

/**
 * Stage-G — public /api/health endpoint for uptime monitoring and
 * container liveness probes. Uses `@nestjs/terminus` for the standard
 * health-check envelope plus a lightweight Prisma DB ping.
 */
@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
