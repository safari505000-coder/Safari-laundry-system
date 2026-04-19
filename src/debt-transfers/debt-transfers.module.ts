import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeneralLedgerModule } from '../general-ledger/general-ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DebtTransfersController } from './debt-transfers.controller';
import { DebtTransfersService } from './debt-transfers.service';

/**
 * Dastur §5 — Debt Transfer workflow.
 *
 * Initiation / finalization: GM or ACCOUNTANT.
 * Signatures: source / target DRIVER.
 * Read & filtering: OWNER (read-only), GM, ACCOUNTANT (full).
 */
@Module({
  imports: [PrismaModule, AuthModule, GeneralLedgerModule],
  controllers: [DebtTransfersController],
  providers: [DebtTransfersService],
  exports: [DebtTransfersService],
})
export class DebtTransfersModule {}
