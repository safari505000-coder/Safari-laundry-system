/**
 * Cash Risk Engine — DTO contract.
 *
 * Implements the v3 Risk Engine spec:
 *   - per-CashUnit aging (NEVER blind aggregation)
 *   - 24h grace period (no scoring + no severity for cash < 24h)
 *   - amount-weighted score with behavioural multiplier
 *   - shift-compliance cap (shift > 16h on YOUNG cash never crosses
 *     WARNING)
 *
 * STRICT contract: this layer is computed from the v2 analysis output.
 * It NEVER queries the database directly, NEVER mutates state, and
 * NEVER auto-fixes anything. The output is the SAME shape regardless
 * of who calls it; branch-clamping happens in the controller.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CashV2AnomalyType,
  CashV2Responsible,
} from '../../cash-intelligence/dto/cash-intelligence-analysis.dto';

export type RiskTrafficLight = 'GREEN' | 'YELLOW' | 'RED';

export type RiskDriverStatus =
  | 'NORMAL'
  | 'WARNING'
  | 'RISK'
  | 'CRITICAL';

export type RiskClassification =
  | 'NEW_CASH'
  | 'AGED'
  | 'SHIFT_COMPLIANCE_ONLY';

export class CashRiskBreakdownDto {
  @ApiProperty({ description: 'KD (4 decimals).' })
  amount!: string;

  @ApiProperty({ description: 'floor(ageHours / 24).' })
  ageDays!: number;

  @ApiProperty({ description: 'Sub-day age. Drives the 24h grace gate.' })
  ageHours!: number;

  @ApiProperty({ description: 'amount × ageDays × amountMultiplier × behaviorMultiplier; 0 within grace.' })
  score!: number;

  @ApiProperty({ enum: ['NEW_CASH', 'AGED', 'SHIFT_COMPLIANCE_ONLY'] })
  classification!: RiskClassification;

  @ApiProperty({ enum: ['DRIVER', 'DRIVER_HANDOVER', 'CUSTODY', 'VERIFIED', 'DEPOSIT', 'BANK'] })
  stage!: string;
}

export class CashRiskDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ description: 'Sum of aged + new cash currently with this driver (KD, 4 decimals).' })
  totalCash!: string;

  @ApiProperty({ description: 'Σ finalScore across all aged units (excludes units in 24h grace).' })
  driverScore!: number;

  @ApiProperty({ enum: ['NORMAL', 'WARNING', 'RISK', 'CRITICAL'] })
  status!: RiskDriverStatus;

  @ApiProperty({
    description:
      'Per-unit breakdown — full transparency. Includes units in grace (score=0, classification=NEW_CASH).',
    type: () => CashRiskBreakdownDto,
    isArray: true,
  })
  breakdown!: CashRiskBreakdownDto[];

  @ApiProperty({ description: 'Late-count proxy: times entered the at-risk set in the last 7 days.' })
  lateCountLast7Days!: number;

  @ApiProperty({ description: 'Behaviour multiplier applied (1.0 or 1.5).' })
  behaviorMultiplier!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Open shift duration (hours). Null when no open shift.' })
  shiftDurationHours!: number | null;

  @ApiProperty({
    description:
      'True when status was capped at WARNING because shift > 16h but ALL cash < 24h. Step 9.',
  })
  shiftComplianceOnly!: boolean;

  @ApiProperty({ description: 'Recommended next action (advisory only).' })
  action!: string;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['DRIVER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SYSTEM', null],
    description: 'Set ONLY when a real anomaly exists. Step 11.',
  })
  responsible!: CashV2Responsible | null;
}

export class CashRiskAnomalyDto {
  @ApiProperty()
  type!: CashV2AnomalyType;

  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  ageDays!: number;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  responsible!: CashV2Responsible;

  @ApiProperty()
  reason!: string;
}

export class CashRiskSummaryDto {
  @ApiProperty()
  totalCash!: string;

  @ApiProperty()
  totalDrivers!: number;

  @ApiProperty()
  driversAtRisk!: number;

  @ApiProperty({ description: 'Cash that crossed the 24h grace gate (KD, 4 decimals).' })
  agedCash!: string;

  @ApiProperty({ description: 'Cash inside the 24h grace gate (KD, 4 decimals).' })
  newCash!: string;
}

export class CashRiskExecutionExplanationDto {
  @ApiProperty({ description: 'Grace gate, in hours. Always 24 per spec.' })
  gracePeriodHours!: number;

  @ApiProperty({ description: 'Severity bands { NORMAL, WARNING, RISK, CRITICAL } as min thresholds.' })
  severityBands!: { warning: number; risk: number; critical: number };

  @ApiProperty({ description: 'Amount tier cuts (KD).' })
  amountTiers!: { small: number; large: number };

  @ApiProperty({ description: 'Shift overdue cap (hours).' })
  shiftOverdueCapHours!: number;

  @ApiProperty()
  generatedAt!: string;
}

export class CashRiskResponseDto {
  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  systemStatus!: RiskTrafficLight;

  @ApiProperty()
  summary!: CashRiskSummaryDto;

  @ApiProperty({ type: () => CashRiskDriverDto, isArray: true })
  drivers!: CashRiskDriverDto[];

  @ApiProperty({ type: () => CashRiskAnomalyDto, isArray: true })
  anomalies!: CashRiskAnomalyDto[];

  @ApiProperty()
  executionSummary!: CashRiskExecutionExplanationDto;

  @ApiProperty()
  readOnly!: true;

  @ApiProperty()
  advisoryOnly!: true;
}
