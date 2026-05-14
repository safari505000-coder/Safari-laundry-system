/**
 * وحدة المدفوعات — تجمع متحكم المدفوعات وخدمة الاتساق وتوفر خدمة المدفوعات للوحدات الأخرى.
 * Payments module — bundles the payments controller, consistency watchdog, and exports PaymentsService.
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomerLedgerModule } from '../customer-ledger/customer-ledger.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { DiscordAlertsModule } from '../common/services/discord-alerts.module';
import { PaymentsService } from '../common/services/payments.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JWT_SECRET_DEV_FALLBACK } from '../common/constants/jwt-secret-fallback';
import { PaymentConsistencyWatchdogService } from './payment-consistency-watchdog.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    ThrottlerModule,
    PrismaModule,
    CustomerLedgerModule,
    CustomerNotificationsModule,
    DiscordAlertsModule,
    GeneralLedgerModule,
    InventoryModule,
    // V1.7.1 — a local JwtModule registration (same secret as AuthModule)
    // lets `PaymentsController` mint short-lived invoice-share tokens for
    // the luxury /payment/success page without reaching into OrdersModule
    // (which would create a dependency cycle: Orders → Payments → Orders).
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK,
      // V24+ — default access TTL is `24h` (see auth.module.ts for rationale).
      // Invoice-share tokens that need a tighter lifetime sign per-call with
      // an explicit `expiresIn` and are unaffected by this default.
      signOptions: {
        expiresIn: (process.env.AUTH_ACCESS_TOKEN_TTL ??
          '24h') as unknown as number,
      },
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentConsistencyWatchdogService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
