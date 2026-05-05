/**
 * Cash Executive — CFO-grade composite output.
 *
 * Layered synthesis on top of the prior endpoints:
 *
 *   Layer 1 (audit truth)        — `/live`
 *   Layer 2 (operational filter) — `/operational`
 *   Layer 3 (real-time status)   — derived here
 *   Layer 4 (decisions)          — `/decisions`
 *   Layer 5 (responsibility)     — derived here per alert type
 *   Layer 6 (priority ranking)   — already done in `/decisions`
 *   Layer 7 (executive output)   — this DTO
 *
 * The shape mirrors the CFO contract exactly so the dashboard can
 * render a single screen without further reshaping.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashExecutionBlockDto } from './cash-execution.dto';
import { ExposureSilentAlertDto } from './cash-exposure.dto';

export type ExecutiveResponsible =
  | 'DRIVER'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'SYSTEM'
  | null;

export type ExecutiveStatus = 'GREEN' | 'YELLOW' | 'RED';
export type ExecutiveUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

export class ExecutiveTopRiskDto {
  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ description: 'Operator-friendly explanation of the risk.' })
  issue!: string;

  @ApiProperty({ description: 'Recommended verb (e.g. CONTACT_DRIVER_IMMEDIATELY).' })
  action!: string;

  @ApiProperty({ enum: ['HIGH', 'MEDIUM', 'LOW'] })
  urgency!: ExecutiveUrgency;

  @ApiProperty({
    enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
    nullable: true,
    description:
      'Layer 5 — assigned ONLY when there is real financial exposure. Null on stale / zero-cash advisories.',
  })
  responsible!: ExecutiveResponsible;

  @ApiProperty({ type: [String] })
  recommendedSteps!: string[];

  @ApiProperty()
  alertType!: string;

  @ApiPropertyOptional({
    type: () => CashExecutionBlockDto,
    nullable: true,
    description:
      'Operational tracking — last action taken on this driver, current status (OPEN/IN_PROGRESS/RESOLVED), and repeat-offender stats. Null when no action has ever been recorded AND the driver has never been flagged.',
  })
  execution!: CashExecutionBlockDto | null;
}

export class ExecutiveActionDto {
  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiProperty()
  action!: string;

  @ApiProperty({ enum: ['HIGH', 'MEDIUM', 'LOW'] })
  urgency!: ExecutiveUrgency;

  @ApiProperty({
    enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
    nullable: true,
  })
  responsible!: ExecutiveResponsible;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  alertType!: string;
}

export class ExecutiveSummaryDto {
  @ApiProperty()
  activeDrivers!: number;

  @ApiProperty()
  driversAtRisk!: number;

  @ApiProperty()
  criticalAlerts!: number;

  @ApiProperty()
  warningAlerts!: number;
}

export class ExecutiveAuditReferenceDto {
  @ApiProperty({ description: 'Total alerts in the audit-truth layer (/live).' })
  totalAlerts!: number;

  @ApiProperty({ description: 'Stale shifts that were filtered from the operational view.' })
  hiddenStaleDrivers!: number;

  @ApiProperty({ description: 'Total cash in flight on the audit layer (KD).' })
  totalCashInFlight!: string;

  @ApiProperty({ description: 'ISO timestamp of the last underlying poll.' })
  lastPollAt!: string | null;
}

export class CashExecutiveResponseDto {
  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  systemStatus!: ExecutiveStatus;

  @ApiProperty()
  generatedAt!: string;

  @ApiPropertyOptional({ nullable: true, type: ExecutiveTopRiskDto })
  topRisk!: ExecutiveTopRiskDto | null;

  @ApiProperty({ type: [ExecutiveActionDto] })
  actions!: ExecutiveActionDto[];

  @ApiProperty()
  summary!: ExecutiveSummaryDto;

  @ApiProperty()
  auditReference!: ExecutiveAuditReferenceDto;

  @ApiProperty({
    description: 'Constant string the dashboard renders verbatim.',
  })
  decisionNote!: string;

  @ApiPropertyOptional({
    type: [ExposureSilentAlertDto],
    nullable: true,
    description:
      'Silent financial-safety alerts (driver exposure + aging escalation). Populated for OWNER / GENERAL_MANAGER / ACCOUNTANT consumers and `null` for MANAGER consumers (never shown on the manager dashboard).',
  })
  silentAlerts!: ExposureSilentAlertDto[] | null;

  @ApiProperty({ description: 'Always true.' })
  readOnly!: true;

  @ApiProperty({ description: 'Always true.' })
  advisoryOnly!: true;
}
