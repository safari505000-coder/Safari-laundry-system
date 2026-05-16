import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PosPaymentMethod, SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DoubleEntryJournalService } from '../general-ledger/double-entry-journal.service';
import { DebtService } from './services/debt.service';

/**
 * متحكم دفتر اليومية — نقاط نهاية القراءة من حساب AR وكشف الحساب للعميل
 * Journal REST controller providing AR balance and statement endpoints for customers.
 * Mounted at `/api/finance/journal/*`.
 */
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
  /**
   * يُرجع رصيد AR من دفتر اليومية مقارنةً بالرصيد من دفتر الالتزام
   * Returns the journal AR balance vs ledger balance for a customer with drift logging.
   */
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

  @Get('customers/:customerId/call-center-bank-statement')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
  )
  @ApiOperation({
    summary:
      'Call-center bank-style journal statement (pay-in, subsidy, wallet, AR running balance)',
  })
  getCustomerCallCenterBankStatement(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.journal.getCustomerCallCenterBankStatement(customerId);
  }

  /**
   * V22 Phase 6 — full balanced double-entry view per entry.
   *
   * Returns every JournalEntry tied to the customer with ALL of its
   * lines (every account, debit and credit), so the audit trail proves
   * Σ Dr = Σ Cr per entry.
   *
   * Available to ACCOUNTANT, GENERAL_MANAGER, and OWNER for financial
   * reporting and audit, in addition to Call Center roles.
   *
   * Optional filters:
   *   - `paymentMethods`: comma-separated PosPaymentMethod values
   *   - `dateFrom` / `dateTo`: ISO date strings (inclusive)
   */
  @Get('customers/:customerId/full-entries')
  @Roles(
    SafariRole.CALL_CENTER,
    SafariRole.CALL_CENTER_SUPERVISOR,
    SafariRole.ACCOUNTANT,
    SafariRole.GENERAL_MANAGER,
    SafariRole.OWNER,
  )
  @ApiOperation({
    summary: 'Full balanced double-entry journal entries for a customer (finance roles)',
  })
  @ApiQuery({ name: 'paymentMethods', required: false, description: 'Comma-separated PosPaymentMethod values to filter by' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO date string inclusive lower bound' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO date string inclusive upper bound' })
  getCustomerFullEntries(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('paymentMethods') paymentMethodsRaw?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const paymentMethods = paymentMethodsRaw
      ? (paymentMethodsRaw.split(',').filter((v) => Object.values(PosPaymentMethod).includes(v as PosPaymentMethod)) as PosPaymentMethod[])
      : undefined;
    return this.journal.getCustomerJournalEntries(customerId, {
      paymentMethods: paymentMethods?.length ? paymentMethods : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }
}
