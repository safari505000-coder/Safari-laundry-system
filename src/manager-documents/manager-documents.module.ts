import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ManagerDocumentsController } from './manager-documents.controller';
import { ManagerDocumentsService } from './manager-documents.service';

/**
 * V19.22.5 — Branch Manager "My Documents" island.
 *
 * Read-only surface that aggregates every Accountant-approved
 * document a manager owns — cash-custody receipts + branch expense
 * vouchers — into a single printable feed.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ManagerDocumentsController],
  providers: [ManagerDocumentsService],
  exports: [ManagerDocumentsService],
})
export class ManagerDocumentsModule {}
