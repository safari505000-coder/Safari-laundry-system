/**
 * Cash Monitor — Operational (filtered) view DTOs.
 *
 * Display-only filter on top of `/live`. The underlying snapshot,
 * anomaly counts and ring buffer are NEVER mutated by this layer:
 *
 *   - ACTIVE drivers are surfaced.
 *   - STALE shifts (no today activity, no exposure) are hidden but
 *     COUNTED so the dashboard can render a "12 hidden" pill.
 *   - SHIFT_OVERDUE alerts are RECLASSIFIED for UI clarity:
 *       SHIFT_COMPLIANCE_DELAY  (compliance, display-only)
 *       SHIFT_OVERDUE_FINANCIAL (financial, capped at WARNING)
 *
 * SINGLE SOURCE OF TRUTH:
 *   This layer NEVER decides severity or domain. It defers to the
 *   `CashClassifierService` (the `/classified` endpoint) for both. It
 *   may FILTER, HIDE, or RE-LABEL for the operator's screen — that is
 *   all. The `domain` and `severity` fields below are projected from
 *   classifier output verbatim. The original alert is still in
 *   `/live`; this view just repackages it for clarity.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MonitorAlertSeverity,
  MonitorTrafficLight,
} from './cash-monitor.dto';

export type OperationalAlertType =
  // R08 reclassifications
  | 'SHIFT_COMPLIANCE_DELAY'
  | 'SHIFT_OVERDUE_FINANCIAL'
  // Surfaces of the financial anomalies (kept verbatim)
  | 'PRE_SHIFT_OVERDUE'
  | 'HIGH_DRIVER_EXPOSURE'
  | 'STUCK_AT_DRIVER'
  | 'HANDOVER_DELAY'
  | 'CUSTODY_DELAY'
  | 'DEPOSIT_NOT_REGISTERED'
  | 'DEPOSIT_AMOUNT_MISMATCH'
  | 'OVERPAYMENT_ANOMALY'
  | 'DOUBLE_COUNT_RISK';

export type OperationalDriverStatus =
  | 'ACTIVE'        // had today activity OR has live exposure
  | 'AT_RISK'       // active AND (exposure > 0 OR pre-overdue / overdue)
  | 'EXPOSURE_ONLY' // no today activity but residual exposure > 0
  | 'STALE';        // open shift, no today activity, no exposure

export class ActiveDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ description: 'Number of CASH orders the driver completed today (Asia/Kuwait day).' })
  ordersTodayCount!: number;

  @ApiProperty({ description: 'KD collected today (sum of completed CASH order totals).' })
  collectedCashToday!: string;

  @ApiProperty({
    description:
      'Total live cash currently attributable to the driver (KD), regardless of origin date.',
  })
  totalCash!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Most recent origin date among any of the driver\'s live flows (YYYY-MM-DD).',
  })
  lastCashActivityDate!: string | null;

  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'NO_SHIFT'] })
  shiftStatus!: 'OPEN' | 'CLOSED' | 'NO_SHIFT';

  @ApiPropertyOptional({ nullable: true })
  shiftDurationHours!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Minutes until the SHIFT_OVERDUE cap (16h) is breached; null when shift is closed or already overdue.',
  })
  countdownMinutes!: number | null;

  @ApiProperty({
    enum: ['ACTIVE', 'AT_RISK', 'EXPOSURE_ONLY', 'STALE'],
    description:
      'Operational classification used by the filter. STALE rows are excluded from the displayed lists; the count is reported in `hidden`.',
  })
  status!: OperationalDriverStatus;
}

export class OperationalAlertDto {
  @ApiProperty()
  type!: OperationalAlertType;

  @ApiProperty({
    enum: ['FINANCIAL', 'COMPLIANCE'],
    description:
      'Authoritative domain from the classifier (single source of truth). Operational layer never decides this — it inherits.',
  })
  domain!: 'FINANCIAL' | 'COMPLIANCE';

  @ApiProperty({
    enum: ['INFO', 'WARNING', 'CRITICAL'],
    description:
      'Authoritative severity from the classifier. Operational layer never increases nor decreases — it inherits.',
  })
  severity!: MonitorAlertSeverity;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiPropertyOptional({ nullable: true })
  countdownMinutes!: number | null;

  @ApiProperty()
  isPrediction!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'When R08 reclassification was applied, this carries the original alert type so the audit trail is preserved.',
  })
  originalType!: string | null;
}

export class OperationalHiddenDto {
  @ApiProperty()
  staleDriversCount!: number;

  @ApiProperty({
    description:
      'Number of underlying alerts removed from the `alerts` list because they fired on a STALE shift with zero financial exposure.',
  })
  excludedAlertCount!: number;

  @ApiProperty()
  note!: string;
}

export class OperationalSummaryDto {
  @ApiProperty({ description: 'totalDriversShown — counts ACTIVE + AT_RISK + EXPOSURE_ONLY rows.' })
  totalDriversShown!: number;

  @ApiProperty({ description: 'Total live cash on shown drivers (KD).' })
  totalCash!: string;

  @ApiProperty({ description: 'Drivers in AT_RISK or EXPOSURE_ONLY classifications.' })
  driversAtRisk!: number;

  @ApiProperty()
  activeAlerts!: number;
}

export class OperationalLiveDto {
  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  realtimeStatus!: MonitorTrafficLight;

  @ApiProperty({ type: [ActiveDriverDto] })
  activeDrivers!: ActiveDriverDto[];

  @ApiProperty({ type: [ActiveDriverDto] })
  driversAtRisk!: ActiveDriverDto[];

  @ApiProperty({ type: [OperationalAlertDto] })
  alerts!: OperationalAlertDto[];

  @ApiProperty()
  hidden!: OperationalHiddenDto;

  @ApiProperty()
  summary!: OperationalSummaryDto;

  @ApiProperty({ description: 'Always true. No data was modified by this view.' })
  readOnly!: true;

  @ApiProperty({ description: 'Always true. The view is advisory; downstream systems must not auto-apply penalties.' })
  advisoryOnly!: true;
}
