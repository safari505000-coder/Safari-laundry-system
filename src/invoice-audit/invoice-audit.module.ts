import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceAuditController } from './invoice-audit.controller';
import { InvoiceAuditService } from './invoice-audit.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GeneralLedgerModule,
    CustomerNotificationsModule,
  ],
  controllers: [InvoiceAuditController],
  providers: [InvoiceAuditService],
  exports: [InvoiceAuditService],
})
export class InvoiceAuditModule {}
