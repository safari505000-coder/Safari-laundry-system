import { Module } from '@nestjs/common';
import { DiscordAlertsModule } from '../common/services/discord-alerts.module';
import { QueueAdminController } from './queue-admin.controller';
import { QueueAdminService } from './queue-admin.service';

@Module({
  imports: [DiscordAlertsModule],
  controllers: [QueueAdminController],
  providers: [QueueAdminService],
})
export class QueueAdminModule {}
