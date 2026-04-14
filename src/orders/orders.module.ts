import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, CustomerLedgerModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
