import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [AuthModule, PrismaModule, OrdersModule],
  controllers: [SubscribersController],
  providers: [SubscribersService],
})
export class SubscribersModule {}
