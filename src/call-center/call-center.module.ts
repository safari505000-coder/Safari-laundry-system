import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CallCenterController } from './call-center.controller';
import { CallCenterService } from './call-center.service';

@Module({
  imports: [PrismaModule, AuthModule, CustomerLedgerModule, PaymentsModule],
  controllers: [CallCenterController],
  providers: [CallCenterService],
})
export class CallCenterModule {}
