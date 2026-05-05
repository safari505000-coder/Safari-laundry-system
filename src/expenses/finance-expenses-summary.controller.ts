import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../auth/permissions/permissions.decorator';
import { AppPermission } from '../auth/permissions/permissions.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { APP_BRAND } from '../common/constants/branding';
import {
  ExpensesSummaryQueryDto,
  ExpensesSummaryResponseDto,
} from './dto/expenses-summary.dto';
import { ExpensesService } from './expenses.service';

/**
 * STRICT ROLE-BASED EXPENSE DESIGN — Part 6 (Unified Expense Calculation / SSoT).
 *
 * Mounted at `GET /api/finance/expenses-summary` per the brief, but
 * lives inside the ExpensesModule so we avoid the
 * AuthModule → FinanceModule → ExpensesModule → AuthModule cycle.
 * Path placement follows REST URL semantics, not Nest module
 * boundaries.
 *
 * Restricted to OWNER, GENERAL_MANAGER and ACCOUNTANT (Part 7) — a
 * branch manager never receives company-wide aggregates.
 */
@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance/expenses-summary')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceExpensesSummaryController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_FINANCIAL_REPORTS)
  @ApiOperation({
    summary: `Expenses SSoT summary (${APP_BRAND})`,
    description:
      'Single source of truth for expense totals (by ownerType / category / branch / month) plus server-computed alerts. Frontends MUST use this endpoint instead of recomputing aggregates from /api/expenses rows.',
  })
  getExpensesSummary(
    @Query() q: ExpensesSummaryQueryDto,
  ): Promise<ExpensesSummaryResponseDto> {
    return this.expensesService.summarize(q.from, q.to, q.branchId);
  }
}
