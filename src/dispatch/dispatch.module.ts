import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DispatchController } from './dispatch.controller';
import { DispatchEscalationJob } from './dispatch.escalation.job';
import { DispatchMetricsService } from './dispatch-metrics.service';
import { DispatchReconciliationJob } from './dispatch.reconciliation.job';
import { DispatchService } from './dispatch.service';

/**
 * V19.x — Self-contained Dispatch (call-center → driver) module.
 *
 * Wires:
 *   - the create/list/SSE/reassign controller;
 *   - the auto-completion listener (Order = the only completer);
 *   - the SLA MONITOR cron (every minute: ASSIGNED thresholds → alerts,
 *     no driver reassignment);
 *   - the RECONCILIATION cron (every 2 minutes, closes ASSIGNED
 *     dispatches whose Order already exists but whose listener
 *     never fired).
 *
 * Both cron jobs depend on `ScheduleModule.forRoot()` being
 * registered at the application root (see `app.module.ts`); the
 * listener relies on `EventEmitterModule.forRoot()` from the same
 * place.
 *
 * No other module needs to import `DispatchService` — the cross-cut
 * with the orders module is event-based, not constructor-injected.
 * Keeping the dependency direction one-way (events → DispatchService)
 * avoids a circular import with OrdersModule.
 */
@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [DispatchController],
  providers: [
    DispatchService,
    DispatchMetricsService,
    DispatchEscalationJob,
    DispatchReconciliationJob,
  ],
  exports: [DispatchService],
})
export class DispatchModule {}
