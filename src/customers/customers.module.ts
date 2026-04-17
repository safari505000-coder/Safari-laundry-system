import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { CustomersController } from './customers.controller';
import { CustomerCoreService } from './customer-core.service';
import { CustomersService } from './customers.service';

@Module({
  imports: [FinanceModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerCoreService],
})
export class CustomersModule {}
