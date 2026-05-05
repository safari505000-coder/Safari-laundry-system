/**
 * Cash Classifier — strict separation of FINANCIAL RISK vs
 * OPERATIONAL COMPLIANCE.
 *
 * The classifier treats two domains as MUTUALLY EXCLUSIVE:
 *
 *   FINANCIAL RISK (allowed WARNING / CRITICAL):
 *     - cash age >= 24h on a flow that is still uncleared
 *     - money chain broken: DEPOSIT_NOT_REGISTERED,
 *       DEPOSIT_AMOUNT_MISMATCH, OVERPAYMENT_ANOMALY,
 *       DOUBLE_COUNT_RISK
 *
 *   OPERATIONAL COMPLIANCE (NEVER a financial CRITICAL):
 *     - SHIFT_OVERDUE
 *     - SHIFT_OPEN_TOO_LONG (placeholder for future v2 emit)
 *     - DRIVER_LATE_HANDOVER on same-day cash
 *
 * Hard rules (Step 2):
 *   - ageHours < 24      → forced NON_FINANCIAL.
 *   - amount  < 5 KD    → never CRITICAL.
 *   - no money-flow break → never CRITICAL.
 *
 * The only thing this layer changes is *classification + display*. It
 * never mutates a record, never deletes an alert, never alters an
 * amount. The audit truth in `/live` is preserved.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SafariRole } from '@prisma/client';

export type ClassifiedTrafficLight = 'GREEN' | 'YELLOW' | 'RED';

export type ClassifiedDriverStatus =
  | 'NORMAL'
  | 'COMPLIANCE_ONLY'
  | 'AT_RISK';

export type ClassifiedAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type ClassifiedDomain = 'FINANCIAL' | 'COMPLIANCE';

export class ClassifiedAlertDto {
  @ApiProperty({ enum: ['FINANCIAL', 'COMPLIANCE'] })
  domain!: ClassifiedDomain;

  @ApiProperty({
    description:
      'Final post-classification type. e.g. SHIFT_COMPLIANCE_ONLY (compliance) vs DEPOSIT_NOT_REGISTERED (financial).',
  })
  type!: string;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  severity!: ClassifiedAlertSeverity;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ description: 'KD, 4 decimals.' })
  amount!: string;

  @ApiProperty({ description: 'Sub-day cash age (hours).' })
  cashAgeHours!: number;

  @ApiProperty()
  reason!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Original v2 type before classification (audit trail).',
  })
  originalType!: string | null;
}

export class ClassifiedDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  branchId!: string | null;

  // V19.x — every cash-holder row is tagged with the holder's
  // `safariRole` so dashboards can split DRIVER vs MANAGER instead of
  // mixing them in one "drivers" table. `null` only when the user
  // record has been deleted (orphan rows from historical data).
  @ApiPropertyOptional({
    nullable: true,
    description:
      "Role of the cash holder (DRIVER, MANAGER, OWNER, …). Lets dashboards separate driver custody from manager-held cash without re-querying the user table.",
  })
  holderRole!: SafariRole | null;

  @ApiProperty({ enum: ['NORMAL', 'COMPLIANCE_ONLY', 'AT_RISK'] })
  status!: ClassifiedDriverStatus;

  @ApiProperty({ description: 'Sub-day age of the driver\'s OLDEST live cash unit, hours.' })
  cashAgeHours!: number;

  @ApiProperty({ description: 'Total live cash on this driver (KD, 4 decimals).' })
  amount!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Open shift duration in hours, when shift is open.' })
  shiftDurationHours!: number | null;

  @ApiProperty({ description: 'Human-readable note explaining the status decision.' })
  note!: string;
}

export class ClassifiedRulesDto {
  @ApiProperty()
  gracePeriodHours!: number;

  @ApiProperty({ description: 'Minimum amount (KD) required to ever cross WARNING.' })
  smallAmountFloorKd!: number;

  @ApiProperty({ description: 'Anomaly types treated as FINANCIAL chain breaks.' })
  financialChainTypes!: string[];

  @ApiProperty({ description: 'Anomaly types treated as OPERATIONAL compliance.' })
  complianceTypes!: string[];

  @ApiProperty({ description: 'Cap applied to SHIFT_OVERDUE_FINANCIAL severity.' })
  shiftFinancialSeverityCap!: ClassifiedAlertSeverity;

  @ApiProperty()
  generatedAt!: string;
}

export class CashClassifiedResponseDto {
  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'] })
  systemStatus!: ClassifiedTrafficLight;

  @ApiProperty({
    description:
      'Alerts that justify dashboard escalation (R/Y/G) — money risk only.',
    type: () => ClassifiedAlertDto,
    isArray: true,
  })
  financialAlerts!: ClassifiedAlertDto[];

  @ApiProperty({
    description:
      'Display-only alerts. Do NOT escalate dashboard color. Operations team should action them but treasury is not at risk.',
    type: () => ClassifiedAlertDto,
    isArray: true,
  })
  complianceAlerts!: ClassifiedAlertDto[];

  @ApiProperty({ type: () => ClassifiedDriverDto, isArray: true })
  drivers!: ClassifiedDriverDto[];

  @ApiProperty({ description: 'One-line decision summary for the operator.' })
  finalDecision!: string;

  @ApiProperty({ description: 'Rule snapshot — the engine documents the cuts it actually applied.' })
  rules!: ClassifiedRulesDto;

  @ApiProperty()
  readOnly!: true;

  @ApiProperty()
  advisoryOnly!: true;
}
