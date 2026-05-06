import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DoubleEntryJournalService } from '../general-ledger/double-entry-journal.service';
import { DebtService } from './services/debt.service';

@ApiTags('finance-journal')
@ApiBearerAuth('bearer')
@Controller('finance/journal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JournalController {
  constructor(
    private readonly journal: DoubleEntryJournalService,
    private readonly debt: DebtService,
  ) {}

  @Get('customers/:customerId/balance')
  @Roles(SafariRole.CALL_CENTER, SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: 'Journal AR balance for one customer' })
  async getCustomerBalance(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    const balance = await this.journal.getCustomerBalanceFromJournal(customerId);
    const ledger = await this.debt.getCustomerNetDebtFromDebtLedger(customerId);
    await this.journal.logCustomerDrift(customerId, ledger.netOpenDebtKd);
    return {
      customerId,
      journalBalanceKd: balance.toFixed(4),
      ledgerBalanceKd: ledger.netOpenDebtKd.toFixed(4),
      computedAt: new Date().toISOString(),
    };
  }

  @Get('customers/:customerId/statement')
  @Roles(SafariRole.CALL_CENTER, SafariRole.ACCOUNTANT, SafariRole.GENERAL_MANAGER)
  @ApiOperation({ summary: 'Journal-based customer AR statement' })
  getCustomerStatement(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.journal.getCustomerStatement(customerId);
  }
}
