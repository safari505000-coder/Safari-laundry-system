import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

/**
 * V24 — Wave B (Frontend Purge).
 *
 * Replaces the FE-side `web/src/lib/sales-debt-analytics.ts` and
 * `sales-debt-insights.ts` helpers. The browser fetched ALL invoices
 * for a date range and ran `reduce()` over `totalPrice` /
 * `posSubscriptionWalletApplied` / etc. to compute per-branch and
 * per-driver sales/collected/debt/collectionRate splits, then
 * generated Arabic insight badges from those locally-aggregated
 * numbers.
 *
 * Per V24 Commandment #5 ("Don't Calculate, Just Ask"), the FE now
 * asks this single endpoint and renders the response. All money
 * fields are canonical 4dp KWD strings; the collection rate is
 * expressed as `collectionRateBps` (basis points, integer 0..10000)
 * to avoid float rounding on the wire.
 */

/**
 * معايير استعلام تحليلات المبيعات والديون — نطاق تاريخي
 * Sales-debt analytics query DTO with ISO date range.
 * @since V24
 */
export class SalesDebtAnalyticsQueryDto {
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2026-01-31T23:59:59.999Z' })
  @IsISO8601()
  to!: string;
}

/**
 * DTO فترة تحليلات المبيعات والديون — نطاق التاريخ المُستخدَم في التحليل
 * Period DTO for the sales-debt analytics response showing the actual window used.
 */
export class SalesDebtAnalyticsPeriodDto {
  @ApiProperty({ description: 'Inclusive ISO start of the requested window (UTC).' })
  fromIso!: string;

  @ApiProperty({ description: 'Inclusive ISO end of the requested window (UTC).' })
  toIso!: string;
}

/**
 * DTO إجماليات تحليلات المبيعات والديون للفترة المحددة
 * Sales-debt analytics totals DTO with canonical KWD amounts and collection rate BPS.
 */
export class SalesDebtAnalyticsTotalsDto {
  @ApiProperty({ description: 'Σ gross sales over the period (canonical 4dp KWD).', example: '1250.0000' })
  totalSalesKd!: string;

  @ApiProperty({ description: 'Σ collected (settled) over the period (canonical 4dp KWD).', example: '900.0000' })
  totalCollectedKd!: string;

  @ApiProperty({ description: 'max(0, sales − collected) (canonical 4dp KWD).', example: '350.0000' })
  totalDebtKd!: string;

  @ApiProperty({
    description:
      'Collection rate expressed as basis points (integer 0..10000). Divide by 100 for percent. Wire-safe alternative to a float.',
    example: 7200,
  })
  collectionRateBps!: number;

  @ApiProperty({ description: 'Number of non-voided invoices counted.', example: 47 })
  invoiceCount!: number;
}

/**
 * DTO مجموعة تحليلات المبيعات والديون — فرع أو سائق
 * Sales-debt analytics group DTO for branch or driver breakdown.
 */
export class SalesDebtAnalyticsGroupDto {
  @ApiProperty({ description: 'Group identifier (branchId / driverId / sentinel "no-branch" / "no-driver").' })
  id!: string;

  @ApiProperty({ description: 'Display label for the group.' })
  name!: string;

  @ApiProperty({ description: 'Σ gross sales for this group (canonical 4dp KWD).', example: '500.0000' })
  totalSalesKd!: string;

  @ApiProperty({ description: 'Σ collected for this group (canonical 4dp KWD).', example: '420.0000' })
  totalCollectedKd!: string;

  @ApiProperty({ description: 'max(0, sales − collected) for this group (canonical 4dp KWD).', example: '80.0000' })
  totalDebtKd!: string;

  @ApiProperty({
    description: 'Collection rate as basis points (integer 0..10000).',
    example: 8400,
  })
  collectionRateBps!: number;

  @ApiProperty({ description: 'Number of invoices in this group.', example: 18 })
  invoiceCount!: number;
}

/**
 * مستوى خطورة رؤية تحليلات المبيعات والديون
 * Sales-debt analytics insight severity level.
 */
export type SalesDebtInsightSeverity = 'info' | 'warning' | 'critical';
/**
 * هدف التعمق في رؤية تحليلات المبيعات والديون
 * Drill-down target for a sales-debt analytics insight.
 */
export type SalesDebtInsightTarget = 'branch' | 'driver';

/**
 * DTO رؤية تحليلات المبيعات والديون — شارة عربية جاهزة للعرض
 * Sales-debt analytics insight DTO with Arabic message badge and optional drill-down target.
 */
export class SalesDebtInsightDto {
  @ApiProperty({ description: 'Stable insight id (used as React key).' })
  id!: string;

  @ApiProperty({ enum: ['info', 'warning', 'critical'] })
  severity!: SalesDebtInsightSeverity;

  @ApiProperty({ description: 'Localized Arabic message ready to render.' })
  message!: string;

  @ApiPropertyOptional({
    enum: ['branch', 'driver'],
    nullable: true,
    description: 'Optional drill-down target the FE may navigate to.',
  })
  target?: SalesDebtInsightTarget;
}

/**
 * DTO استجابة تحليلات المبيعات والديون — مصدر موحد للحقيقة
 * Sales-debt analytics full response DTO with period, totals, by-branch, by-driver, and insights.
 * @since V24
 */
export class SalesDebtAnalyticsResponseDto {
  @ApiProperty({ example: 'api/finance/sales-debt-analytics' })
  source!: 'api/finance/sales-debt-analytics';

  @ApiProperty({ type: () => SalesDebtAnalyticsPeriodDto })
  period!: SalesDebtAnalyticsPeriodDto;

  @ApiProperty({ type: () => SalesDebtAnalyticsTotalsDto })
  totals!: SalesDebtAnalyticsTotalsDto;

  @ApiProperty({ type: () => SalesDebtAnalyticsGroupDto, isArray: true })
  byBranch!: SalesDebtAnalyticsGroupDto[];

  @ApiProperty({ type: () => SalesDebtAnalyticsGroupDto, isArray: true })
  byDriver!: SalesDebtAnalyticsGroupDto[];

  @ApiProperty({ type: () => SalesDebtInsightDto, isArray: true })
  insights!: SalesDebtInsightDto[];
}
