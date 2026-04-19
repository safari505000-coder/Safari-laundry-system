import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal DB liveness check — issues `SELECT 1` so we exercise the
 * socket, driver, and at least one round-trip. Keeps the health probe
 * under 50ms on a warm pool; surfaces a 503 on DB outage.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Prisma DB ping failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
