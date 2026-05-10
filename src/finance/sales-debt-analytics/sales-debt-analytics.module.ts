import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SalesDebtAnalyticsController } from './sales-debt-analytics.controller';
import { SalesDebtAnalyticsService } from './sales-debt-analytics.service';

/**
 * V24 — Wave B (Frontend Purge) — Sales / Debt analytics SSoT module.
 *
 * Owns `GET /api/finance/sales-debt-analytics` which replaces the
 * deleted FE helpers `sales-debt-analytics.ts` and
 * `sales-debt-insights.ts`. Read-only, pure aggregation; no
 * persistence side effects.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SalesDebtAnalyticsController],
  providers: [SalesDebtAnalyticsService],
  exports: [SalesDebtAnalyticsService],
})
export class SalesDebtAnalyticsModule {}
