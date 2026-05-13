/**
 * LedgerController — Stage A double-entry projection API.
 *
 * Six endpoints, all read-only, all OWNER / GENERAL_MANAGER /
 * ACCOUNTANT only:
 *
 *   GET /api/finance/ledger/bank-statement/:entityId — customer AR (1300) journal view
 *   GET /api/finance/ledger/summary               — global + per-account totals
 *   GET /api/finance/ledger/driver/:id            — DRIVER_<id> account view
 *   GET /api/finance/ledger/manager/:id           — MANAGER_<id> account view
 *   GET /api/finance/ledger/transactions          — flat entry stream (paginated)
 *   GET /api/finance/ledger/reconciliation        — Σdebit == Σcredit invariant
 *
 * Responses are pre-calculated server-side. The client must NEVER
 * recompute totals — the projection is the only source of truth and
 * a Stage A invariant test asserts that fact in CI.
 */
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../auth/permissions/permissions.decorator';
import { AppPermission } from '../../auth/permissions/permissions.enum';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  LedgerRangeQueryDto,
  LedgerTransactionsQueryDto,
  assertWithinMaxRange,
  defaultFromIso,
  defaultToIso,
} from './dto/ledger-query.dto';
import {
  LedgerAccountResponseDto,
  LedgerReconciliationResponseDto,
  LedgerSummaryResponseDto,
  LedgerTransactionsResponseDto,
} from './dto/ledger-response.dto';
import { LedgerProjectionService } from './ledger-projection.service';
import { LedgerBankStatementService } from './ledger-bank-statement.service';

const FINANCE_ROLES: SafariRole[] = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
];

function resolveRange(q: LedgerRangeQueryDto): {
  fromIso: string;
  toIso: string;
} {
  const fromIso = q.from ?? defaultFromIso();
  const toIso = q.to ?? defaultToIso();
  try {
    assertWithinMaxRange(fromIso, toIso);
  } catch (e) {
    throw new BadRequestException(
      e instanceof Error ? e.message : 'Invalid date range',
    );
  }
  return { fromIso, toIso };
}

function ensureFinanceRole(user: JwtUser): void {
  if (!FINANCE_ROLES.includes(user.role as SafariRole)) {
    throw new ForbiddenException(
      'Ledger endpoints are restricted to OWNER, GENERAL_MANAGER, and ACCOUNTANT.',
    );
  }
}

/**
 * متحكم دفتر الأستاذ — نقاط نهاية إسقاط القيود المزدوجة (للقراءة فقط)
 * Stage A double-entry projection REST controller.
 * Provides 6 read-only endpoints: bank-statement, summary, driver/manager accounts,
 * transactions, and reconciliation. Mounted at `/api/finance/ledger/*`.
 */
@ApiTags('finance-ledger')
@ApiBearerAuth('bearer')
@Controller('finance/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCE_ROLES)
@Permissions(AppPermission.VIEW_FINANCIAL_REPORTS)
export class LedgerController {
  constructor(
    private readonly projection: LedgerProjectionService,
    private readonly bankStatement: LedgerBankStatementService,
  ) {}

  @Get('bank-statement/:entityId')
  @ApiOkResponse({
    description:
      'Read-only AR (1300) journal lines for a customer with running balance.',
  })
  /**
   * يُرجع كشف حساب بنكي بأسلوب AR لعميل محدد
   * Returns a bank-statement-style AR (1300) journal view for a customer with running balance.
   */
  async getBankStatement(
    @CurrentUser() user: JwtUser,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    ensureFinanceRole(user);
    return this.bankStatement.getBankStatement(entityId);
  }

  @Get('summary')
  @ApiOkResponse({ type: LedgerSummaryResponseDto })
  async getSummary(
    @CurrentUser() user: JwtUser,
    @Query() q: LedgerRangeQueryDto,
  ): Promise<LedgerSummaryResponseDto> {
    ensureFinanceRole(user);
    const { fromIso, toIso } = resolveRange(q);
    const entries = await this.projection.project({ fromIso, toIso });
    const accounts = this.projection.aggregateAccounts(entries);
    const recon = this.projection.reconcile(entries, fromIso, toIso);
    return {
      source: 'api/finance/ledger/summary',
      fromIso,
      toIso,
      totalEntries: recon.totalEntries,
      totalTransactions: recon.totalTransactions,
      globalDebit: recon.globalDebit,
      globalCredit: recon.globalCredit,
      accounts,
      generatedAt: recon.generatedAt,
    };
  }

  @Get('driver/:id')
  @ApiOkResponse({ type: LedgerAccountResponseDto })
  async getDriverAccount(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) driverId: string,
    @Query() q: LedgerRangeQueryDto,
  ): Promise<LedgerAccountResponseDto> {
    ensureFinanceRole(user);
    const { fromIso, toIso } = resolveRange(q);
    return this.accountView(`DRIVER_${driverId}`, fromIso, toIso);
  }

  @Get('manager/:id')
  @ApiOkResponse({ type: LedgerAccountResponseDto })
  async getManagerAccount(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) managerId: string,
    @Query() q: LedgerRangeQueryDto,
  ): Promise<LedgerAccountResponseDto> {
    ensureFinanceRole(user);
    const { fromIso, toIso } = resolveRange(q);
    return this.accountView(`MANAGER_${managerId}`, fromIso, toIso);
  }

  @Get('transactions')
  @ApiOkResponse({ type: LedgerTransactionsResponseDto })
  async getTransactions(
    @CurrentUser() user: JwtUser,
    @Query() q: LedgerTransactionsQueryDto,
  ): Promise<LedgerTransactionsResponseDto> {
    ensureFinanceRole(user);
    const { fromIso, toIso } = resolveRange(q);
    const all = await this.projection.project({ fromIso, toIso });
    const filtered = q.accountPrefix
      ? all.filter((e) => e.accountId.startsWith(q.accountPrefix as string))
      : all;
    const take = q.take ?? 200;
    const sliced = filtered.slice(0, take);
    return {
      source: 'api/finance/ledger/transactions',
      fromIso,
      toIso,
      totalEntries: filtered.length,
      entries: sliced,
      generatedAt: new Date().toISOString(),
    };
  }

  @Get('reconciliation')
  @ApiOkResponse({ type: LedgerReconciliationResponseDto })
  async getReconciliation(
    @CurrentUser() user: JwtUser,
    @Query() q: LedgerRangeQueryDto,
  ): Promise<LedgerReconciliationResponseDto> {
    ensureFinanceRole(user);
    const { fromIso, toIso } = resolveRange(q);
    const entries = await this.projection.project({ fromIso, toIso });
    const recon = this.projection.reconcile(entries, fromIso, toIso);
    return {
      source: 'api/finance/ledger/reconciliation',
      ...recon,
    };
  }

  private async accountView(
    accountId: string,
    fromIso: string,
    toIso: string,
  ): Promise<LedgerAccountResponseDto> {
    const all = await this.projection.project({ fromIso, toIso });
    const entries = all.filter((e) => e.accountId === accountId);
    const balanceList = this.projection.aggregateAccounts(entries);
    const balance = balanceList[0] ?? {
      accountId,
      totalDebit: '0.0000',
      totalCredit: '0.0000',
      balance: '0.0000',
      entryCount: 0,
    };
    return {
      source: 'api/finance/ledger/account',
      accountId,
      fromIso,
      toIso,
      balance,
      entries,
      generatedAt: new Date().toISOString(),
    };
  }
}
