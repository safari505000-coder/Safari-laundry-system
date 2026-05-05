/**
 * Cash Intelligence — Driver Exposure & Aging Escalation (silent layer).
 *
 * Strict READ-ONLY safety surface that aggregates *per-driver* live cash
 * exposure and breaks it down into aging buckets. Designed to surface
 * silent risk that the operational dashboard intentionally hides:
 *
 *   - The MANAGER dashboard never sees these counters.
 *   - Visibility is restricted to the ACCOUNTANT and EXECUTIVE views
 *     (OWNER + GENERAL_MANAGER) because they own the financial-safety
 *     mandate.
 *
 * The output is purely advisory. There are NO action buttons, NO state
 * mutations, NO workflow hooks. This layer prevents UNNOTICED
 * accumulation by ensuring the right audience always has visibility.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CashV2Stage } from '../../cash-intelligence/dto/cash-intelligence-analysis.dto';

/**
 * Aging bucket per cash unit.
 *   PENDING    < 24h   — within the grace gate, no escalation.
 *   OVERDUE    ≥ 24h   — first escalation tier.
 *   HIGH_RISK  ≥ 48h   — money has aged a full second day.
 *   CRITICAL   ≥ 72h   — multi-day persistence; financial safety priority.
 */
export type ExposureAgingBucket =
  | 'PENDING'
  | 'OVERDUE'
  | 'HIGH_RISK'
  | 'CRITICAL';

/**
 * Risk level per driver derived from the *higher of* the amount-tier
 * (≥200 KD warning, ≥500 KD critical) and the age-tier (oldest unit
 * 48h → HIGH_RISK, 72h → CRITICAL).
 */
export type ExposureRiskLevel =
  | 'NORMAL'
  | 'WARNING'
  | 'HIGH_RISK'
  | 'CRITICAL';

/** Reason a silent alert was raised. */
export type ExposureSilentAlertType =
  | 'AMOUNT_THRESHOLD' // totalExposure crossed the 200/500 KD bands
  | 'AGING_THRESHOLD'; // a batch crossed the 24/48/72h bands

export class ExposureBatchDto {
  @ApiProperty({
    description:
      'Stable batch identifier — currently the originating order id.',
  })
  batchId!: string;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ description: 'Asia/Kuwait YYYY-MM-DD origin day.' })
  originDate!: string;

  @ApiProperty({ description: 'Hours since the order was completed.' })
  ageHours!: number;

  @ApiProperty({
    enum: ['PENDING', 'OVERDUE', 'HIGH_RISK', 'CRITICAL'],
    description: 'Aging bucket derived from `ageHours`.',
  })
  ageBucket!: ExposureAgingBucket;

  @ApiProperty({ description: 'Current pipeline stage of the batch.' })
  stage!: CashV2Stage;
}

export class ExposureDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({
    description: 'Sum of all PENDING + OVERDUE batches for this driver (KD).',
  })
  totalExposure!: string;

  @ApiProperty({
    description: 'Number of batches contributing to `totalExposure`.',
  })
  batchCount!: number;

  @ApiProperty({
    description:
      'Hours since the driver\'s OLDEST live batch was completed. Zero when no batches.',
  })
  oldestPendingAgeHours!: number;

  @ApiProperty({
    enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
    description: 'Risk band from amount thresholds (≥200 KD warning, ≥500 KD critical).',
  })
  amountRiskLevel!: ExposureRiskLevel;

  @ApiProperty({
    enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
    description: 'Risk band from oldest batch age (24h/48h/72h escalation).',
  })
  ageRiskLevel!: ExposureRiskLevel;

  @ApiProperty({
    enum: ['NORMAL', 'WARNING', 'HIGH_RISK', 'CRITICAL'],
    description:
      'Combined risk level — the higher of `amountRiskLevel` and `ageRiskLevel`.',
  })
  riskLevel!: ExposureRiskLevel;

  @ApiProperty({ type: [ExposureBatchDto] })
  batches!: ExposureBatchDto[];
}

export class ExposureSilentAlertDto {
  @ApiProperty({ enum: ['AMOUNT_THRESHOLD', 'AGING_THRESHOLD'] })
  type!: ExposureSilentAlertType;

  @ApiProperty({
    enum: ['WARNING', 'HIGH_RISK', 'CRITICAL'],
    description: 'Severity of this silent alert.',
  })
  level!: Exclude<ExposureRiskLevel, 'NORMAL'>;

  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Total exposure when the alert was raised (KD), if amount-based.',
  })
  totalExposure!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Hours of the oldest batch when the alert was raised, if age-based.',
  })
  ageHours!: number | null;

  @ApiProperty({
    description:
      'Pre-localised Arabic message — already wrapped for direct rendering in the silent feed.',
  })
  message!: string;

  @ApiProperty()
  generatedAt!: string;
}

export class ExposureSummaryDto {
  @ApiProperty()
  totalDrivers!: number;

  @ApiProperty()
  driversAtWarning!: number;

  @ApiProperty()
  driversAtHighRisk!: number;

  @ApiProperty()
  driversAtCritical!: number;

  @ApiProperty({ description: 'Total cash exposure across all drivers (KD).' })
  totalExposure!: string;
}

export class CashExposureResponseDto {
  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: ExposureSummaryDto })
  summary!: ExposureSummaryDto;

  @ApiProperty({ type: [ExposureDriverDto] })
  drivers!: ExposureDriverDto[];

  @ApiProperty({
    type: [ExposureSilentAlertDto],
    description:
      'Silent alerts raised by the amount + aging thresholds. Visible only in accountant + executive views; never shown on the manager dashboard.',
  })
  silentAlerts!: ExposureSilentAlertDto[];

  @ApiProperty({
    description: 'Always true. The endpoint never modifies any record.',
  })
  readOnly!: true;

  @ApiProperty({
    description: 'Always true. No automatic actions are taken on these alerts.',
  })
  advisoryOnly!: true;

  @ApiProperty({
    description:
      'Audience marker for the consumer — accountant and executive views only. Manager UIs MUST NOT render this payload.',
  })
  audience!: 'ACCOUNTANT_AND_EXECUTIVE';
}

/** Threshold constants — exported so docs and tests can reference them. */
export const EXPOSURE_THRESHOLDS = {
  amount: {
    warningKd: 200,
    criticalKd: 500,
  },
  ageHours: {
    overdue: 24,
    highRisk: 48,
    critical: 72,
  },
} as const;
