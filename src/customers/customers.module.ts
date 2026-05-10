import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { CustomerCoreService } from './customer-core.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer360Service } from './customer-360.service';

@Module({
  imports: [FinanceModule, GeneralLedgerModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomerCoreService,
    Customer360Service,
    CustomerBlockingService,
  ],
})
export class CustomersModule {}
