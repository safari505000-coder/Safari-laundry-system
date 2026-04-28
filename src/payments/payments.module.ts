import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { PaymentsService } from '../common/services/payments.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JWT_SECRET_DEV_FALLBACK } from '../common/constants/jwt-secret-fallback';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    PrismaModule,
    CustomerLedgerModule,
    CustomerNotificationsModule,
    GeneralLedgerModule,
    InventoryModule,
    // V1.7.1 — a local JwtModule registration (same secret as AuthModule)
    // lets `PaymentsController` mint short-lived invoice-share tokens for
    // the luxury /payment/success page without reaching into OrdersModule
    // (which would create a dependency cycle: Orders → Payments → Orders).
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
      signOptions: {
        expiresIn: (process.env.AUTH_ACCESS_TOKEN_TTL ??
          '15m') as unknown as number,
      },
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
