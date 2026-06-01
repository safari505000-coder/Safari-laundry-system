import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FinanceModule } from '../finance/finance.module';
import { AccountingHealthController } from './accounting-health.controller';
import { AccountingHealthService } from './accounting-health.service';
import { AccountingIntegrityCronService } from './accounting-integrity.cron';
import { FinancialIntegrityService } from './financial-integrity.service';

/**
 * FINANCIAL HARDENING module.
 *
 * Additive. Depends on:
 *   - PrismaModule                  (DB reads / report persistence)
 *   - FinanceModule                 (exports ReconciliationService)
 *   - global AuditLogsService       (audit trail)
 *   - global DiscordAlertService    (owner/security alerts)
 *   - global EventEmitter           (finance.drift.detected listener)
 *
 * Exposes the reusable FinancialIntegrityService guard and the read-only
 * accounting-health surface. Does NOT modify any existing financial
 * module or accounting behaviour.
 */
@Module({
  imports: [PrismaModule, FinanceModule],
  controllers: [AccountingHealthController],
  providers: [
    FinancialIntegrityService,
    AccountingHealthService,
    AccountingIntegrityCronService,
  ],
  exports: [FinancialIntegrityService, AccountingHealthService],
})
export class FinancialIntegrityModule {}
