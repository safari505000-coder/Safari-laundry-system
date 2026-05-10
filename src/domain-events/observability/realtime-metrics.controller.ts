import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RealtimeMetricsService } from './realtime-metrics.service';
import type {
  ObservabilitySnapshot,
  RealtimeAlert,
} from './realtime-metrics.service';

/**
 * V20.9 — Phase 6 observability endpoint.
 *
 * Owner / GM-only — exposes the dispatcher + realtime gateway
 * counters as a single JSON snapshot the operations dashboard
 * polls (default cadence 15s).
 *
 *   GET /api/realtime/financial/observability
 */
@ApiTags('realtime.financial')
@ApiBearerAuth('bearer')
@Controller('realtime/financial/observability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER)
export class RealtimeMetricsController {
  constructor(private readonly metrics: RealtimeMetricsService) {}

  @Get()
  @ApiOperation({
    summary: 'V20.9 — Realtime + Event Bus observability snapshot',
    description:
      'Lock-free in-memory metrics. Counters reset on process restart; the durable audit trail lives in `FinancialEventOutbox`.',
  })
  snapshot(): ObservabilitySnapshot & { alerts: RealtimeAlert[] } {
    return {
      ...this.metrics.getSnapshot(),
      alerts: this.metrics.evaluateAlerts(),
    };
  }
}
