import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { DebtVisibilityModule } from '../finance/debt-visibility/debt-visibility.module';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SerialsModule } from '../serials/serials.module';
import { CustomerPortalAuthService } from './customer-portal-auth.service';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { WebsiteCustomerPaymentsService } from './website-customer-payments.service';
import { WebsiteOrderRequestsService } from './website-order-requests.service';
import { ExpoPushService } from './expo-push.service';

@Module({
  imports: [
    PrismaModule,
    SerialsModule,
    FinanceModule,
    PaymentsModule,
    DebtVisibilityModule,
    AuthModule,
    CustomerNotificationsModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [PublicApiController],
  providers: [
    PublicApiService,
    ExpoPushService,
    CustomerPortalAuthService,
    WebsiteOrderRequestsService,
    WebsiteCustomerPaymentsService,
  ],
  exports: [WebsiteCustomerPaymentsService, ExpoPushService],
})
export class PublicApiModule {}
