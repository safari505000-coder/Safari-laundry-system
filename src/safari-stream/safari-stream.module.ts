import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LaundryPriceListModule } from '../laundry-price-list/laundry-price-list.module';
import { ManagerCustodyModule } from '../manager-custody/manager-custody.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { SystemModule } from '../system/system.module';
import { SafariStreamController } from './safari-stream.controller';
import { SafariStreamService } from './safari-stream.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SystemModule,
    ReportsModule,
    LaundryPriceListModule,
    ManagerCustodyModule,
  ],
  controllers: [SafariStreamController],
  providers: [SafariStreamService],
  exports: [SafariStreamService],
})
export class SafariStreamModule {}
