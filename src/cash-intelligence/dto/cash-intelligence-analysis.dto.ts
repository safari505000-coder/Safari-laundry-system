/**
 * Cash Intelligence v2 — STRICT READ-ONLY analysis output.
 *
 * Implements the v2 prompt contract:
 *   STEP 0  Execution explanation     (executionSummary)
 *   STEP 1  Validation gate per driver (driverGate inside flow + locationSummary)
 *   STEP 4  Tolerance band 0.010 KD   (toleranceKd)
 *   STEP 6  Amount-aware severity     (severity ∈ INFO/WARNING/CRITICAL/ESCALATED)
 *   STEP 9  Decision lock              (actionLocked + requiresManualReview)
 *   STEP 10 Output shape               (this file)
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type CashV2Health = 'OK' | 'WARNING' | 'CRITICAL';

export type CashV2Severity =
  | 'INFO'
  | 'WARNING'
  | 'CRITICAL'
  | 'CRITICAL_ESCALATED';

export type CashV2DriverGate =
  | 'NO_ACTIVITY_TODAY'
  | 'HISTORICAL_BALANCE'
  | 'ACTIVE_FLOW'
  | 'SHIFT_OVERDUE';

export type CashV2AmountTier = 'SMALL' | 'MEDIUM' | 'LARGE';

export type CashV2Stage =
  | 'DRIVER'
  | 'DRIVER_HANDOVER'
  | 'CUSTODY'
  | 'VERIFIED'
  | 'DEPOSIT'
  | 'BANK';

export type CashV2AnomalyType =
  | 'SHIFT_OVERDUE'
  | 'STUCK_AT_DRIVER'
  | 'HANDOVER_DELAY'
  | 'CUSTODY_DELAY'
  | 'DEPOSIT_NOT_REGISTERED'
  | 'DEPOSIT_AMOUNT_MISMATCH'
  | 'DOUBLE_COUNT_RISK'
  | 'OVERPAYMENT_ANOMALY'
  | 'SUBSCRIPTION_LEAKAGE';

export type CashV2Responsible =
  | 'DRIVER'
  | 'BRANCH_MANAGER'
  | 'ACCOUNTANT'
  | 'SYSTEM';

export class CashV2ExecutionSummaryDto {
  @ApiProperty({ type: [String], description: 'Tables and selectors actually queried (read-only).' })
  dataFetched!: string[];

  @ApiProperty({ type: [String], description: 'Pipeline steps actually applied.' })
  logicApplied!: string[];

  @ApiProperty({ type: [String], description: 'Records suppressed and the WHY (anti-false-positive trail).' })
  ignoredCases!: string[];

  @ApiProperty({ type: [String], description: 'Assumptions made where the prompt was ambiguous.' })
  assumptions!: string[];

  @ApiProperty({ description: 'Tolerance band applied to amount comparisons (KD, 4 dp).' })
  toleranceKd!: string;

  @ApiProperty({ description: 'Cap applied to open shifts before SHIFT_OVERDUE fires (hours).' })
  shiftOverdueCapHours!: number;

  @ApiProperty({ description: 'Asia/Kuwait calendar day used as the report anchor.' })
  asOfDate!: string;

  @ApiProperty({ description: 'ISO timestamp when the report was generated.' })
  generatedAt!: string;
}

export class CashV2SummaryDto {
  @ApiProperty()
  totalCash!: string;

  @ApiProperty()
  newCash!: string;

  @ApiProperty()
  agedCash!: string;

  @ApiProperty()
  issues!: number;
}

export class CashV2LocationSummaryDto {
  @ApiProperty({ description: 'Cash currently with drivers (DRIVER + DRIVER_HANDOVER).' })
  DRIVER!: string;

  @ApiProperty({ description: 'Cash held by branch manager custody (CUSTODY + VERIFIED).' })
  CUSTODY!: string;

  @ApiProperty({ description: 'Cash logged at the bank (DEPOSIT + BANK).' })
  BANK!: string;
}

export class CashV2FlowDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  amountTier!: CashV2AmountTier;

  @ApiProperty({ description: 'Asia/Kuwait YYYY-MM-DD.' })
  originDate!: string;

  @ApiProperty()
  ageDays!: number;

  @ApiProperty({
    description:
      'Sub-day cash age in hours (now − Order.completedAt). Two decimals. Used by the Risk Engine for the 24h grace gate and per-unit scoring.',
  })
  ageHours!: number;

  @ApiProperty()
  stage!: CashV2Stage;

  @ApiProperty()
  driverGate!: CashV2DriverGate;

  @ApiProperty({ description: 'Driver shift status AT REPORT TIME.' })
  shiftStatus!: 'OPEN' | 'CLOSED' | 'NO_SHIFT';

  @ApiPropertyOptional({ nullable: true })
  shiftDurationHours!: number | null;

  @ApiProperty({ description: 'True when context validator suppresses this row.' })
  ignoredNonOperational!: boolean;

  @ApiProperty({ description: 'Why the row was or was not suppressed.' })
  contextReason!: string;
}

export class CashV2AnomalyDto {
  @ApiProperty()
  type!: CashV2AnomalyType;

  @ApiProperty()
  severity!: CashV2Severity;

  @ApiProperty()
  amount!: string;

  @ApiProperty()
  amountTier!: CashV2AmountTier;

  @ApiProperty()
  ageDays!: number;

  @ApiProperty()
  stage!: CashV2Stage;

  @ApiProperty()
  responsible!: CashV2Responsible;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty()
  reason!: string;

  @ApiProperty({
    description:
      'STEP 9 Decision Lock — true when severity may NOT trigger penalty/payroll action without manual review (anomaly age < 2 days).',
  })
  actionLocked!: boolean;

  @ApiProperty({
    description:
      'STEP 9 Decision Lock — anomalies aged 2+ days or ESCALATED still require an explicit manual reviewer before any HR/payroll action.',
  })
  requiresManualReview!: boolean;
}

export class CashIntelligenceAnalysisDto {
  @ApiProperty()
  executionSummary!: CashV2ExecutionSummaryDto;

  @ApiProperty({ enum: ['OK', 'WARNING', 'CRITICAL'] })
  systemHealth!: CashV2Health;

  @ApiProperty()
  summary!: CashV2SummaryDto;

  @ApiProperty()
  locationSummary!: CashV2LocationSummaryDto;

  @ApiProperty({ type: [CashV2FlowDto] })
  flows!: CashV2FlowDto[];

  @ApiProperty({ type: [CashV2AnomalyDto] })
  anomalies!: CashV2AnomalyDto[];

  @ApiProperty()
  finalAssessment!: string;

  @ApiProperty({ description: 'Always true. Endpoint never mutates state.' })
  readOnly!: true;

  @ApiProperty({
    description:
      'Always true. STEP 9 — this layer is advisory; downstream systems must not auto-apply penalties.',
  })
  advisoryOnly!: true;
}
