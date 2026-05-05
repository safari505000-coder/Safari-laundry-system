import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/roles.decorator';
import { APP_BRAND } from '../common/constants/branding';
import { PrismaHealthIndicator } from './prisma.health';

/**
 * Stage-G — single liveness probe that checks:
 *   • DB connectivity (Prisma ping)
 *   • Heap pressure (warn at 300MB — tweakable via env)
 *   • RSS pressure (warn at 500MB)
 *
 * Intentionally public (no JWT) so UptimeRobot / BetterStack can hit
 * it without a pre-shared secret. The payload contains no business
 * data, only status booleans.
 */
@ApiTags('health')
@Controller('health')
@Public('Infrastructure liveness probe contains no business data.')
export class HealthController {
  private readonly heapLimitBytes: number;
  private readonly rssLimitBytes: number;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {
    this.heapLimitBytes =
      Number.parseInt(process.env.HEALTH_HEAP_LIMIT_MB ?? '300', 10) *
      1024 *
      1024;
    this.rssLimitBytes =
      Number.parseInt(process.env.HEALTH_RSS_LIMIT_MB ?? '500', 10) *
      1024 *
      1024;
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: `Liveness probe (${APP_BRAND})` })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', this.heapLimitBytes),
      () => this.memory.checkRSS('memory_rss', this.rssLimitBytes),
    ]);
  }
}
