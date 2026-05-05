import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerNotificationsService } from './customer-notifications.service';
import { WhatsAppQueueService } from './whatsapp-queue.service';
import { WhatsAppWorker } from './whatsapp.worker';

@Module({
  imports: [PrismaModule],
  providers: [CustomerNotificationsService, WhatsAppQueueService, WhatsAppWorker],
  exports: [CustomerNotificationsService, WhatsAppQueueService],
})
export class CustomerNotificationsModule {}
