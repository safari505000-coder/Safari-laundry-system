import { Module } from '@nestjs/common';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { PaymentsService } from '../common/services/payments.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [PrismaModule, CustomerLedgerModule, GeneralLedgerModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
