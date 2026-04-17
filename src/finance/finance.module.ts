import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BankDepositsController } from './bank-deposits.controller';
import { BankDepositsService } from './bank-deposits.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { CashService } from './services/cash.service';
import { DebtService } from './services/debt.service';
import { OnlinePaymentService } from './services/online-payment.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [FinanceController, BankDepositsController, DepositsController],
  providers: [
    FinanceService,
    BankDepositsService,
    DepositsService,
    CashService,
    OnlinePaymentService,
    DebtService,
    SubscriptionService,
  ],
  exports: [
    FinanceService,
    BankDepositsService,
    DepositsService,
    DebtService,
    SubscriptionService,
  ],
})
export class FinanceModule {}
