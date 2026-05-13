import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialTimelineController } from './financial-timeline.controller';
import { FinancialTimelineService } from './financial-timeline.service';

/**
 * وحدة الجدول الزمني المالي — تمتلك نقطة نهاية الجدول الزمني الموحد للعميل
 * V20.4 Phase 8 unified financial timeline module.
 * Owns the read-only GET /api/finance/timeline/:customerId endpoint and its service.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FinancialTimelineController],
  providers: [FinancialTimelineService],
  exports: [FinancialTimelineService],
})
export class FinancialTimelineModule {}
