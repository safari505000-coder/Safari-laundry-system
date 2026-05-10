import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { DebtVisibilityService } from './debt-visibility.service';

/**
 * V20.4 — Phase 3 / Phase 12 read-only endpoints backing the
 * frontend hooks (`useCustomerDebt`, `useFinancialSnapshot`,
 * `useInvoiceStatus`, `useCollectionsSummary`).
 *
 * Read-only — no endpoint here mutates any financial row.
 * Roles match the existing finance audit / outstanding
 * roles so anyone who can already see customer balances
 * can read the canonical view.
 */
const VISIBILITY_READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER,
  SafariRole.CALL_CENTER_SUPERVISOR,
  SafariRole.MANAGER,
  SafariRole.SUPERVISOR,
] as const;

@ApiTags('finance.visibility')
@ApiBearerAuth('bearer')
@Controller('finance/visibility')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DebtVisibilityController {
  constructor(private readonly visibility: DebtVisibilityService) {}

  @Get('customer/:customerId')
  @Roles(...VISIBILITY_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.4 — Phase 3 canonical customer debt view (read-side projection first; live canonical fallback)',
  })
  async getCustomer(@Param('customerId') customerId: string) {
    return this.visibility.getCustomerVisibleDebt(customerId);
  }

  @Get('invoice/:orderId')
  @Roles(...VISIBILITY_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.4 — Phase 3 canonical invoice payment status (UNPAID / PARTIALLY_PAID / PAID + amounts)',
  })
  async getInvoice(@Param('orderId') orderId: string) {
    const status = await this.visibility.getInvoiceStatus(orderId);
    if (!status) throw new NotFoundException('invoice not found');
    return status;
  }

  @Get('collections-summary')
  @Roles(...VISIBILITY_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.4 — Phase 3 / Phase 4 canonical collections KPI snapshot (total remainingDebtKd + counts)',
  })
  async getCollectionsSummary() {
    return this.visibility.getCollectionsSnapshot();
  }
}
