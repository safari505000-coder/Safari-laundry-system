import { Module } from '@nestjs/common';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SerialsModule } from '../serials/serials.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WebsiteCustomerPaymentsService } from './website-customer-payments.service';
import { WebsiteOrderRequestsService } from './website-order-requests.service';

@Module({
  imports: [PrismaModule, SerialsModule, FinanceModule, PaymentsModule, DebtVisibilityModule],
  controllers: [PublicApiController],
  providers: [
    PublicApiService,
    WebsiteOrderRequestsService,
    WebsiteCustomerPaymentsService,
  ],
  exports: [WebsiteCustomerPaymentsService],
})
export class PublicApiModule {}
