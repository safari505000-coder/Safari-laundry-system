/**
 * Cash Monitor — DTOs.
 *
 * The monitor is purely additive on top of the v2 analysis. It never
 * recomputes financial logic; it only diffs snapshots and surfaces
 * predictive (R06) and exposure (R07) advisories.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type MonitorAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type MonitorAlertType =
  // Predictive / state-machine alerts owned by THIS module
  | 'PRE_SHIFT_OVERDUE'
  | 'HIGH_DRIVER_EXPOSURE'
  // Diff-based alerts (transitions vs the previous snapshot)
  | 'NEW_FLOW'
  | 'FLOW_UPDATED'
  | 'STAGE_CHANGED'
  | 'NEW_ANOMALY'
  | 'SEVERITY_ESCALATED'
  // Mirrored from the analysis (dedup'd)
  | 'SHIFT_OVERDUE'
  | 'STUCK_AT_DRIVER'
  | 'HANDOVER_DELAY'
  | 'CUSTODY_DELAY'
  | 'DEPOSIT_NOT_REGISTERED'
  | 'DEPOSIT_AMOUNT_MISMATCH'
  | 'DOUBLE_COUNT_RISK'
  | 'OVERPAYMENT_ANOMALY'
  | 'SUBSCRIPTION_LEAKAGE';

export type MonitorTrafficLight = 'GREEN' | 'YELLOW' | 'RED';

export class MonitorAlertDto {
  @ApiProperty()
  type!: MonitorAlertType;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
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

  @ApiProperty({ description: 'ISO timestamp when this alert was first emitted.' })
  timestamp!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Minutes remaining before the underlying threshold is breached. Set on PRE_SHIFT_OVERDUE only; null otherwise.',
  })
  countdownMinutes!: number | null;

  @ApiProperty({
    description:
      'True for predictive alerts (R06 PRE_SHIFT_OVERDUE) — surfaces a possible future violation, not a current one.',
  })
  isPrediction!: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Stable dedup key.' })
  dedupKey!: string | null;
}

export class MonitorDriverExposureDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ description: 'Total live cash currently attributable to this driver (KD).' })
  totalCash!: string;

  @ApiProperty({ description: 'Number of live flows associated with the driver.' })
  flowsCount!: number;

  @ApiProperty()
  shiftStatus!: 'OPEN' | 'CLOSED' | 'NO_SHIFT';

  @ApiPropertyOptional({ nullable: true })
  shiftDurationHours!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Minutes until SHIFT_OVERDUE for the open shift; null when shift is closed.',
  })
  countdownMinutes!: number | null;
}

export class MonitorLocationSummaryDto {
  @ApiProperty()
  DRIVER!: string;

  @ApiProperty()
  CUSTODY!: string;

  @ApiProperty()
  BANK!: string;
}

export class MonitorSummaryDto {
  @ApiProperty()
  totalCash!: string;

  @ApiProperty()
  driversAtRisk!: number;

  @ApiProperty()
  activeAnomalies!: number;

  @ApiProperty()
  openShifts!: number;
}

export class CashMonitorLiveDto {
  @ApiProperty({ description: 'ISO timestamp when this snapshot was assembled.' })
  timestamp!: string;

  @ApiProperty({ description: 'ISO timestamp of the latest underlying analysis poll.' })
  lastPollAt!: string | null;

  @ApiProperty({ description: 'Time since the last successful poll (seconds).' })
  lastPollAgeSeconds!: number | null;

  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  realtimeStatus!: MonitorTrafficLight;

  @ApiProperty()
  activeDrivers!: number;

  @ApiProperty({ type: [MonitorAlertDto] })
  preRisk!: MonitorAlertDto[];

  @ApiProperty({ type: [MonitorAlertDto] })
  alerts!: MonitorAlertDto[];

  @ApiProperty({ type: [MonitorDriverExposureDto] })
  driversAtRisk!: MonitorDriverExposureDto[];

  @ApiProperty()
  locationSummary!: MonitorLocationSummaryDto;

  @ApiProperty()
  summary!: MonitorSummaryDto;

  @ApiProperty({ description: 'Always true — this layer never modifies data.' })
  readOnly!: true;

  @ApiProperty({ description: 'Always true — alerts are advisory; no auto-actions.' })
  advisoryOnly!: true;
}
