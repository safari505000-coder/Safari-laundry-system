import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../auth/permissions/permissions.decorator';
import { AppPermission } from '../../auth/permissions/permissions.enum';
import { APP_BRAND } from '../../common/constants/branding';
import {
  SalesDebtAnalyticsQueryDto,
  SalesDebtAnalyticsResponseDto,
} from './dto/sales-debt-analytics.dto';
import { SalesDebtAnalyticsService } from './sales-debt-analytics.service';

/**
 * V24 — Wave B Authority endpoint that replaces the FE-side
 * `sales-debt-analytics.ts` + `sales-debt-insights.ts` aggregation
 * pair. The browser used to call `/api/orders` for a date range and
 * crunch the result locally; per V24 Commandment #5 it now asks
 * here for the pre-computed view.
 */
/**
 * متحكم تحليلات المبيعات والديون — نقطة نهاية التحليلات المُجمَّعة من السرفر
 * Sales-debt analytics REST controller providing server-aggregated sales, collection,
 * and debt totals with per-branch/driver breakdowns and Arabic insight badges.
 * Replaces FE-side aggregation (V24 Commandment #5).
 * Mounted at `/api/finance/sales-debt-analytics`.
 * @since V24
 */
@ApiTags('finance')
@ApiBearerAuth('bearer')
@Controller('finance/sales-debt-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesDebtAnalyticsController {
  constructor(private readonly service: SalesDebtAnalyticsService) {}

  @Get()
  @Roles(SafariRole.OWNER, SafariRole.GENERAL_MANAGER, SafariRole.ACCOUNTANT)
  @Permissions(AppPermission.VIEW_FINANCIAL_REPORTS)
  @ApiOperation({
    summary: `Sales / Collected / Debt analytics SSoT (${APP_BRAND})`,
    description:
      'Single source of truth for the Sales-vs-Debt management report. ' +
      'Returns server-aggregated totals, per-branch and per-driver ' +
      'breakdowns, and pre-rendered Arabic insight badges. Frontends ' +
      'MUST consume this endpoint instead of fetching raw orders and ' +
      'aggregating in the browser (V24 Commandment #5).',
  })
  /**
   * يُرجع تحليلات المبيعات والديون المُجمَّعة للفترة المحددة
   * Returns pre-computed sales/collection/debt analytics for the given date range.
   */
  getAnalytics(
    @Query() q: SalesDebtAnalyticsQueryDto,
  ): Promise<SalesDebtAnalyticsResponseDto> {
    return this.service.getAnalytics(q.from, q.to);
  }
}
