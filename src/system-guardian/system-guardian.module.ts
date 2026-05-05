/**
 * SystemGuardianModule — autonomous platform watcher + WhatsApp
 * notifier surface.
 *
 * Imports `CashMonitorModule` so the Guardian can re-use the live
 * snapshot the dashboard sees without re-running v2 analysis or
 * duplicating financial logic. Adds two surfaces:
 *
 *   GET  /api/system-guardian/status
 *   POST /api/system-guardian/run
 *
 * The Guardian boots its scheduled sweep via `OnModuleInit` /
 * `@Interval` from inside `SystemGuardianService`. No additional
 * controllers, no Prisma writers, no extra queues.
 */
import { Module } from '@nestjs/common';
import { CashMonitorModule } from '../cash-monitor/cash-monitor.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { SystemGuardianController } from './system-guardian.controller';
import { SystemGuardianService } from './system-guardian.service';
import { OwnerAlertNotifierService } from './owner-alert-notifier.service';

@Module({
  // SystemConfigModule supplies the dynamic guardianPhone the
  // notifier uses (DB → env → none fallback chain). It is purely
  // operational: no financial state passes through this dependency.
  imports: [CashMonitorModule, SystemConfigModule],
  controllers: [SystemGuardianController],
  providers: [SystemGuardianService, OwnerAlertNotifierService],
  exports: [SystemGuardianService],
})
export class SystemGuardianModule {}
