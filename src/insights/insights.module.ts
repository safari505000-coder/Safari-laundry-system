import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { WeeklyExecutiveReportService } from './weekly-executive-report.service';

/**
 * Stage-C — AI / BI insights.
 *
 * `AuthModule` is deliberately NOT imported here. JwtAuthGuard /
 * RolesGuard are referenced by class import and globally registered
 * under AppModule, so re-importing AuthModule from any non-auth
 * feature creates a circular dependency (see the recent
 * InventoryModule fix for the same trap).
 */
@Module({
  imports: [PrismaModule],
  controllers: [InsightsController],
  providers: [InsightsService, WeeklyExecutiveReportService],
  exports: [InsightsService, WeeklyExecutiveReportService],
})
export class InsightsModule {}
