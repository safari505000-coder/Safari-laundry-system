import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagerCustodyController } from './manager-custody.controller';
import { ManagerCustodyService } from './manager-custody.service';

/**
 * Dastur §3 — Manager Accountability.
 * Owns the ManagerCashCustody lifecycle (driver → manager → accountant).
 */
@Module({
  imports: [PrismaModule, AuthModule, GeneralLedgerModule],
  controllers: [ManagerCustodyController],
  providers: [ManagerCustodyService],
  exports: [ManagerCustodyService],
})
export class ManagerCustodyModule {}
