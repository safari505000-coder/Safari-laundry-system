import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerBlockGuard } from '../common/guards/customer-block.guard';
import { CustomerBlockingService } from '../common/services/customer-blocking.service';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule, GeneralLedgerModule],
  controllers: [PosController],
  providers: [PosService, CustomerBlockGuard, CustomerBlockingService],
})
export class PosModule {}
