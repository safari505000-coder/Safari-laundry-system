/**
 * Driver Amount Audit — strict per-driver cross-layer reconciliation.
 *
 * Designed to catch the exact symptom:
 *   "Driver shows 111 KD on one page and 0.5 KD on another."
 *
 * The audit is STRICT READ-ONLY:
 *   - Reads `/classified`, `/risk`, `/live`, `/operational`, `/executive`.
 *   - Matches drivers ONLY by `driverId` — `driverName` is informational.
 *   - Never recomputes financial logic; only compares values.
 *   - Returns a deterministic JSON report.
 *
 * The endpoint:
 *   GET /api/cash-intelligence/driver-amount-audit
 *   RBAC: OWNER + GENERAL_MANAGER
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Closed root-cause taxonomy. Each value maps to a distinct fix path
 * the on-call operator can follow without re-reading the audit code.
 */
export type DriverAmountRootCause =
  | 'CLASSIFICATION_DRIFT'        // /classified ≠ /risk
  | 'SNAPSHOT_DRIFT'              // /classified ≠ /live (stale poll snapshot)
  | 'FILTERING_BUG'               // /operational ≠ /classified (filter logic broken)
  | 'EXECUTIVE_PROJECTION_BUG'    // /executive (topRisk) ≠ /classified
  | 'PARTIAL_DATA_OR_STALE_CACHE' // only one layer reports a meaningful value
  | 'MIXED_DRIFT';                // multiple distinct drift signals at once

export class DriverAmountSnapshotDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'KD (4 decimals) on /classified.drivers[].amount, or null when absent.',
  })
  classified!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'KD (4 decimals) on /risk.drivers[].totalCash, or null when absent.',
  })
  risk!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'KD (4 decimals) on /live.driversAtRisk[].totalCash, or null when absent.',
  })
  live!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'KD (4 decimals) on /operational.activeDrivers[]+driversAtRisk[].totalCash, or null when absent.',
  })
  operational!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'KD (4 decimals) on /executive.topRisk.amount or /executive.silentAlerts.byDriver[].totalExposure, or null when absent.',
  })
  executive!: string | null;
}

export class DriverAmountPresenceDto {
  @ApiProperty()
  classified!: boolean;

  @ApiProperty()
  risk!: boolean;

  @ApiProperty()
  live!: boolean;

  @ApiProperty()
  operational!: boolean;

  @ApiProperty()
  executive!: boolean;
}

export class DriverAmountMismatchDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiProperty({
    type: () => DriverAmountSnapshotDto,
    description: 'Per-layer amounts (string KD, 4 decimals) — null when the driver is absent on that layer.',
  })
  amounts!: DriverAmountSnapshotDto;

  @ApiProperty({
    type: () => DriverAmountPresenceDto,
    description: 'Which layers carried the driver. False = the layer did not list this driverId.',
  })
  presence!: DriverAmountPresenceDto;

  @ApiProperty({
    description:
      'maxAmount - minAmount across all five layers, with missing layers treated as 0 for the math (per spec).',
  })
  difference!: string;

  @ApiProperty({
    description: 'Floor of the populated amounts (KD).',
  })
  minAmount!: string;

  @ApiProperty({
    description: 'Ceiling of the populated amounts (KD).',
  })
  maxAmount!: string;

  @ApiProperty({ enum: ['CRITICAL', 'WARNING'] })
  severity!: 'CRITICAL' | 'WARNING';

  @ApiProperty()
  rootCause!: DriverAmountRootCause;

  @ApiProperty({ description: 'Human-readable reasons supporting the root cause.' })
  reasons!: string[];
}

export class DriverAmountAuditSummaryDto {
  @ApiProperty()
  totalMismatches!: number;

  @ApiProperty({
    description: 'Drivers where the worst delta exceeds 5 KD (financial floor).',
  })
  criticalDrivers!: number;

  @ApiProperty()
  layersChecked!: number;
}

export class DriverAmountAuditResponseDto {
  @ApiProperty({ enum: ['PASS', 'FAIL'] })
  status!: 'PASS' | 'FAIL';

  @ApiProperty()
  totalDrivers!: number;

  @ApiProperty({ type: [DriverAmountMismatchDto] })
  mismatches!: DriverAmountMismatchDto[];

  @ApiProperty({
    type: [DriverAmountMismatchDto],
    description:
      'Drivers whose values match across all layers — kept here for transparency / debugging.',
  })
  matched!: DriverAmountMismatchDto[];

  @ApiProperty({ type: () => DriverAmountAuditSummaryDto })
  summary!: DriverAmountAuditSummaryDto;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ description: 'Always true — audit never writes data.' })
  readOnly!: true;
}
