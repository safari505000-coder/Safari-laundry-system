import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialTimelineController } from './financial-timeline.controller';
import { FinancialTimelineService } from './financial-timeline.service';

/**
 * V20.4 — Phase 8 unified timeline module.
 *
 * Owns the read-only `GET /api/finance/timeline/:customerId`
 * endpoint and its supporting service.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FinancialTimelineController],
  providers: [FinancialTimelineService],
  exports: [FinancialTimelineService],
})
export class FinancialTimelineModule {}
