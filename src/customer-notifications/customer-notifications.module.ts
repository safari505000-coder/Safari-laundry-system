import { Module } from '@nestjs/common';
import { CustomerNotificationsService } from './customer-notifications.service';

@Module({
  providers: [CustomerNotificationsService],
  exports: [CustomerNotificationsService],
})
export class CustomerNotificationsModule {}
