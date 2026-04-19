import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentMethodFeesController } from './payment-method-fees.controller';
import { PaymentMethodFeesService } from './payment-method-fees.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PaymentMethodFeesController],
  providers: [PaymentMethodFeesService],
  exports: [PaymentMethodFeesService],
})
export class PaymentMethodFeesModule {}
