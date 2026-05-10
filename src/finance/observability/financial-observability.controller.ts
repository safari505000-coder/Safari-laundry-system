import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SafariRole } from '@prisma/client';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FinancialObservabilityService } from './financial-observability.service';

const ALLOWED_ROLES = new Set<string>([
  SafariRole.OWNER,
  SafariRole.GENERAL_MANAGER,
  SafariRole.ACCOUNTANT,
]);

/**
 * V20.6 — Phase 3 Financial Observability HTTP surface.
 *
 * Read-only. Roles: OWNER / GM / ACCOUNTANT. The dashboards consume
 * `/overview` for the KPI strip and pull `/drift`, `/reconciliation`,
 * `/performance` on demand for incident response.
 */
@Controller('api/finance/observability')
@UseGuards(JwtAuthGuard)
export class FinancialObservabilityController {
  constructor(private readonly svc: FinancialObservabilityService) {}

  @Get('overview')
  async getOverview(
    @CurrentUser() user: JwtUser,
    @Query('windowHours') windowHours?: string,
  ) {
    this.assertRead(user);
    return this.svc.overview(this.parseWindow(windowHours));
  }

  @Get('drift')
  async getDrift(
    @CurrentUser() user: JwtUser,
    @Query('windowHours') windowHours?: string,
  ) {
    this.assertRead(user);
    return this.svc.drift(this.parseWindow(windowHours));
  }

  @Get('reconciliation')
  async getReconciliation(@CurrentUser() user: JwtUser) {
    this.assertRead(user);
    return this.svc.reconciliationReport();
  }

  @Get('performance')
  async getPerformance(
    @CurrentUser() user: JwtUser,
    @Query('windowHours') windowHours?: string,
  ) {
    this.assertRead(user);
    return this.svc.performance(this.parseWindow(windowHours));
  }

  private parseWindow(value?: string): number {
    const n = value ? Number(value) : 24;
    if (!Number.isFinite(n)) return 24;
    return Math.min(168, Math.max(1, n));
  }

  private assertRead(user: JwtUser) {
    const role = (user.role ?? '').trim().toUpperCase();
    if (!ALLOWED_ROLES.has(role)) {
      throw new ForbiddenException('Financial observability restricted');
    }
  }
}
