import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CashIntelligenceController } from './cash-intelligence.controller';
import { CashIntelligenceV2Service } from './cash-intelligence-v2.service';

/**
 * Cash Intelligence Layer — read-only analyser.
 *
 * No mutations. No queues. No cron writes. Pure analytics on top of
 * the existing cash chain (orders + shifts + manager custody + bank
 * deposit log).
 *
 * Stabilisation cleanup (post-audit): v1 service + engines removed.
 * Only the v2 strict-mode analyser is exported. All downstream
 * consumers (cash-monitor, classifier, risk, exposure, decisions,
 * executive) read from this single producer.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CashIntelligenceController],
  providers: [CashIntelligenceV2Service],
  exports: [CashIntelligenceV2Service],
})
export class CashIntelligenceModule {}
