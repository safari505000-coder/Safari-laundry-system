/**
 * Cash Decision Engine — output DTOs.
 *
 * The decision layer NEVER recomputes financial logic. It only:
 *   - Sorts the operational alerts by severity → amount → time.
 *   - Maps each alert type to a recommended action + urgency.
 *   - Picks the single top risk so the operator has ONE clear
 *     north-star decision (per Step 4 FINAL RULE).
 *
 * The mapping is opinionated but conservative:
 *   - Anything touching driver-held cash → HIGH urgency.
 *   - Branch / accountant linkage gaps → MEDIUM urgency.
 *   - Compliance-only / pre-risk advisories → LOW.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type DecisionUrgency = 'HIGH' | 'MEDIUM' | 'LOW';

export type DecisionActionVerb =
  | 'CONTACT_DRIVER_IMMEDIATELY'
  | 'CLOSE_SHIFT'
  | 'ALERT_DRIVER_BEFORE_OVERDUE'
  | 'REQUEST_PARTIAL_HANDOVER'
  | 'ESCALATE_TO_BRANCH_MANAGER'
  | 'ESCALATE_TO_ACCOUNTANT'
  | 'MANUAL_RECONCILIATION_REQUIRED'
  | 'INVESTIGATE_DOUBLE_COUNT'
  | 'REVIEW_SUBSCRIPTION_BILLING'
  | 'NO_ACTION';

export class DecisionActionDto {
  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ description: 'Underlying operational alert type that produced this decision.' })
  alertType!: string;

  @ApiProperty({
    enum: ['FINANCIAL', 'COMPLIANCE'],
    description:
      'Inherited from the classifier. COMPLIANCE actions are advisory and never escalate beyond LOW urgency.',
  })
  domain!: 'FINANCIAL' | 'COMPLIANCE';

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  action!: DecisionActionVerb;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: ['HIGH', 'MEDIUM', 'LOW'] })
  urgency!: DecisionUrgency;

  @ApiProperty({ type: [String] })
  recommendedSteps!: string[];

  @ApiProperty({ description: 'ISO timestamp from the originating alert.' })
  timestamp!: string;
}

export class DecisionTopRiskDto {
  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty({ description: 'Operator-friendly summary of the underlying issue.' })
  issue!: string;

  @ApiProperty()
  action!: DecisionActionVerb;

  @ApiProperty({ enum: ['HIGH', 'MEDIUM', 'LOW'] })
  urgency!: DecisionUrgency;

  @ApiProperty({ type: [String] })
  recommendedSteps!: string[];

  @ApiProperty()
  alertType!: string;
}

export class DecisionSummaryDto {
  @ApiProperty()
  critical!: number;

  @ApiProperty()
  warning!: number;

  @ApiProperty()
  info!: number;

  @ApiProperty()
  totalActions!: number;
}

export class CashDecisionsResponseDto {
  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  realtimeStatus!: 'GREEN' | 'YELLOW' | 'RED';

  @ApiPropertyOptional({
    nullable: true,
    type: DecisionTopRiskDto,
    description:
      'The single most important decision for the operator. Null when no alerts qualify.',
  })
  topRisk!: DecisionTopRiskDto | null;

  @ApiProperty({ type: [DecisionActionDto] })
  actions!: DecisionActionDto[];

  @ApiProperty()
  summary!: DecisionSummaryDto;

  @ApiProperty({ description: 'Always true — no data was modified.' })
  readOnly!: true;

  @ApiProperty({ description: 'Always true — recommendations only; no auto-execution.' })
  advisoryOnly!: true;
}
