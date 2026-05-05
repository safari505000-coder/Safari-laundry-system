import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DiscordAlertsModule } from '../common/services/discord-alerts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditIntegrityCron } from './audit-integrity.cron';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditSecurityGuard } from './audit-security.guard';
import { SecurityStateService } from './security-state.service';

@Global()
@Module({
  imports: [PrismaModule, DiscordAlertsModule],
  controllers: [AuditLogsController],
  providers: [
    AuditLogsService,
    SecurityStateService,
    AuditIntegrityCron,
    {
      provide: APP_GUARD,
      useClass: AuditSecurityGuard,
    },
  ],
  exports: [AuditLogsService, SecurityStateService],
})
export class AuditLogsModule {}
