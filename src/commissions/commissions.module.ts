import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentMethodFeesModule } from '../payment-method-fees/payment-method-fees.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { CommissionEarningCron } from './commission-earning.cron';
import { CommissionEarningService } from './commission-earning.service';
import { CommissionPayoutsController } from './commission-payouts.controller';
import { CommissionPayoutsService } from './commission-payouts.service';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SystemSettingsModule,
    PaymentMethodFeesModule,
  ],
  controllers: [CommissionRulesController, CommissionPayoutsController],
  providers: [
    CommissionRulesService,
    CommissionEarningService,
    CommissionPayoutsService,
    CommissionEarningCron,
  ],
  exports: [CommissionEarningService, CommissionPayoutsService],
})
export class CommissionsModule {}
