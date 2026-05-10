import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { FinancialAuditService } from './financial-audit.service';
import {
  UiDriftInspectorService,
  type UiDriftStatus,
} from './ui-drift-inspector.service';

/**
 * V20.1-v3 — Real-time financial audit REST surface.
 *
 * Routes are mounted under `/finance/audit/*` (the Nest app
 * applies `setGlobalPrefix('api')`, producing the v3-prompt
 * endpoint `GET /api/finance/audit/overview`).
 *
 * READ-ONLY. No endpoint here mutates any financial row. The
 * endpoints exist to:
 *   • surface drift between CustomerWallet.debt and DebtLedger net
 *   • surface PAYMENT rows that violate the v2 write contract
 *   • feed an operator dashboard with a single-pass alerts summary
 *
 * Restricted to roles that already have AR / collections access.
 */
const AUDIT_READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
  SafariRole.CALL_CENTER_SUPERVISOR,
] as const;

/**
 * V20.3.2 — Phase 2 dedicated read-roles for the UI-drift
 * endpoint. Spec restricts this to OWNER / GENERAL_MANAGER /
 * ACCOUNTANT (no Call Center, no driver, no manager).
 */
const UI_DRIFT_READ_ROLES = [
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
] as const;

const UI_DRIFT_STATUSES = new Set<UiDriftStatus>([
  'OK',
  'UI_DRIFT',
  'LEGACY_READER',
  'CRITICAL',
]);

@ApiTags('finance.audit')
@ApiBearerAuth('bearer')
@Controller('finance/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialAuditController {
  constructor(
    private readonly audit: FinancialAuditService,
    private readonly uiDrift: UiDriftInspectorService,
  ) {}

  @Get('overview')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v3 — per-customer wallet vs ledger drift + classification (paginated)',
  })
  getOverview(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.audit.getOverview({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get('invalid-payments')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v3 — DebtLedgerEntry PAYMENT rows missing actor / sourceRef / positive amount',
  })
  getInvalidPayments(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.audit.getInvalidPayments({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('alerts')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v3 — counts of all alert classes (drift, overpayment, double-count, invalid PAYMENT, missing wallet PAYMENT)',
  })
  getAlertsSummary() {
    return this.audit.getAlertsSummary();
  }

  @Get('reconcile')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v4 — Phase 17 three-way reconciliation: ledger vs journal vs wallet (paginated)',
  })
  getReconcile(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.audit.getReconcile({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get('fraud-signals')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v4 — Phase 23 fraud signals (overpayment, orphan wallet PAYMENT, repeated-amount burst)',
  })
  getFraudSignals(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.audit.getFraudSignals({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('global-invariant')
  @Roles(...AUDIT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.1-v4 — Phase 24 per-customer global invariant (walletBalance + totalPayments + totalDebt = totalInvoices)',
  })
  checkGlobalInvariant(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.audit.checkGlobalInvariant({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: cursor ?? null,
    });
  }

  /**
   * V20.3.2 — Phase 2 UI drift inspector.
   *
   * Returns a per-customer comparison of the SIX legacy debt
   * sources (canonical / subscriber / collections / wallet /
   * ledger / journal) and classifies each row as OK, UI_DRIFT,
   * LEGACY_READER, or CRITICAL.
   *
   * Pagination uses the same opaque `customerId` cursor pattern
   * as the rest of `/finance/audit/*`. `status` filters the
   * returned rows (counts in `summary` always reflect the page).
   * `q` runs a case-insensitive substring match against
   * displayName / phone.
   */
  @Get('ui-drift')
  @Roles(...UI_DRIFT_READ_ROLES)
  @ApiOperation({
    summary:
      'V20.3.2 — Phase 2 UI drift scan: canonical vs subscriber/collections/wallet/ledger/journal per customer',
  })
  getUiDrift(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const upper = status?.trim().toUpperCase() as UiDriftStatus | undefined;
    const statusFilter =
      upper && UI_DRIFT_STATUSES.has(upper) ? upper : null;
    return this.uiDrift.scan({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: cursor ?? null,
      statusFilter,
      search: q?.trim() || null,
    });
  }
}
