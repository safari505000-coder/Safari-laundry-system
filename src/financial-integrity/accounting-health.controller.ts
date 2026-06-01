import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountingHealthService } from './accounting-health.service';

/**
 * FINANCIAL HARDENING — owner/accountant accounting integrity surface.
 *
 * Read-only. Returns HEALTHY / WARNING / CRITICAL with the per-check
 * breakdown (journal integrity, ledger integrity, unbalanced entries,
 * broken chains, failed reconciliations, duplicate transactions).
 */
@ApiTags('owner-accounting-health')
@ApiBearerAuth('bearer')
@Controller('owner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(SafariRole.OWNER, SafariRole.ACCOUNTANT)
export class AccountingHealthController {
  constructor(private readonly health: AccountingHealthService) {}

  @Get('accounting-health')
  @ApiOperation({
    summary: 'Accounting integrity health',
    description:
      'Journal integrity, ledger integrity, unbalanced entries, broken audit chains, failed reconciliations and duplicate transactions, summarized as HEALTHY / WARNING / CRITICAL.',
  })
  getAccountingHealth() {
    return this.health.computeHealth();
  }
}
