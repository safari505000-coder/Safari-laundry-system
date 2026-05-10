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
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
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
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({ summary: 'Journal-based customer AR statement' })
  getCustomerStatement(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.journal.getCustomerStatement(customerId);
  }

  /**
   * V22 Phase 6 — full balanced double-entry view per entry.
   *
   * Operators kept asking "where is the matching double-entry?" because
   * the AR-only statement above shows just one side. This endpoint
   * returns every JournalEntry tied to the customer with ALL of its
   * lines (every account, debit and credit), so the audit trail proves
   * Σ Dr = Σ Cr per entry.
   */
  @Get('customers/:customerId/full-entries')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary: 'Full balanced double-entry journal entries for a customer',
  })
  getCustomerFullEntries(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.journal.getCustomerJournalEntries(customerId);
  }
}
