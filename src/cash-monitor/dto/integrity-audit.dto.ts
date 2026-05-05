/**
 * Integrity Audit — cross-layer financial consistency report.
 *
 * Returned by `GET /api/cash-intelligence/integrity-audit`.
 *
 * Compares values across:
 *   /classified  /risk  /executive  /live  /operational
 *
 * STRICT READ-ONLY: the underlying service consumes the same
 * snapshot the dashboard sees and never recomputes financial logic.
 * Every issue is reported with its two source layers and exact delta
 * so an engineer can localise the drift without re-querying.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type IntegrityIssueSeverity = 'CRITICAL' | 'WARNING';

/**
 * Concrete issue families. We keep the enum closed so dashboards can
 * branch on `type` without falling back to free-text matching.
 */
export type IntegrityIssueType =
  // Cross-layer status drift — the SSoT contract is broken.
  | 'STATUS_DRIFT'
  // Severity counts on /executive don't match /classified.
  | 'CRITICAL_COUNT_MISMATCH'
  | 'WARNING_COUNT_MISMATCH'
  // /executive.topRisk doesn't match the shape of /classified.financialAlerts.
  | 'TOPRISK_INCONSISTENCY'
  // A classifier output violates a hard rule — these should be
  // unreachable; if observed they're CRITICAL bugs.
  | 'AMOUNT_FLOOR_VIOLATION'
  | 'AGE_GATE_VIOLATION'
  // The same driver shows different totalCash on two layers.
  | 'DRIVER_AMOUNT_MISMATCH'
  // /classified.drivers + /live.summary.totalCash disagree by more than tolerance.
  | 'TOTAL_CASH_DRIFT'
  // A driver is in /risk but missing from /classified, or vice-versa.
  | 'DRIVER_LAYER_MISMATCH'
  // Edge cases that aren't strictly bugs but worth surfacing.
  | 'ALERT_WITHOUT_DRIVER'
  | 'TOPRISK_DRIVER_NOT_IN_CLASSIFIED';

export class IntegrityIssueDto {
  @ApiProperty()
  type!: IntegrityIssueType;

  @ApiProperty({ enum: ['CRITICAL', 'WARNING'] })
  severity!: IntegrityIssueSeverity;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Expected value as a string. May be a number, status, or count.',
  })
  expected!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Observed value. Same encoding as `expected`.',
  })
  found!: string | null;

  @ApiProperty({
    description:
      'Logical name of the first layer that produced the value (e.g. "/classified", "/risk").',
  })
  sourceA!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Logical name of the second layer being compared. Null for single-source violations (threshold rules).',
  })
  sourceB!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Numeric delta as a string when the comparison is numeric. Null otherwise.',
  })
  delta!: string | null;

  @ApiProperty()
  message!: string;
}

export class IntegrityAuditSummaryDto {
  @ApiProperty()
  driversChecked!: number;

  @ApiProperty()
  alertsChecked!: number;

  @ApiProperty()
  layersChecked!: number;

  @ApiProperty()
  mismatches!: number;

  @ApiProperty()
  warnings!: number;

  @ApiProperty()
  generatedAt!: string;
}

export class IntegrityAuditResponseDto {
  @ApiProperty({ enum: ['PASS', 'FAIL'] })
  status!: 'PASS' | 'FAIL';

  @ApiProperty({
    description:
      'True when at least one CRITICAL issue was detected. Operators must treat the dashboard as suspect until this is `false`.',
  })
  blocked!: boolean;

  @ApiProperty({ type: [IntegrityIssueDto] })
  criticalIssues!: IntegrityIssueDto[];

  @ApiProperty({ type: [IntegrityIssueDto] })
  warnings!: IntegrityIssueDto[];

  @ApiProperty()
  summary!: IntegrityAuditSummaryDto;

  @ApiProperty({ description: 'Always true — this audit never writes data.' })
  readOnly!: true;
}
