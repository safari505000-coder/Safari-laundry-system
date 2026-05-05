/**
 * CashDashboard — UI-ready response for `GET /api/cash-intelligence/dashboard`.
 *
 * Single Source of Truth (SSoT) compatibility contract:
 *
 *   • `systemStatus` and per-driver cash come from
 *     `CashClassifierService` (the only sanctioned producer of money).
 *   • `topRisk` is a verbatim projection of `CashExecutiveService`.
 *   • `totalCash` is `Σ classified.drivers[].amount` formatted with the
 *     canonical `sumClassifiedKdLabel` helper. It MUST equal the same
 *     fixed-4 KD string every other layer publishes.
 *   • `summaryText` is a deterministic Arabic label derived ONLY from
 *     `systemStatus` (no severity counts, no thresholds — the
 *     classifier already encoded those decisions).
 *
 * Frontend compatibility guarantee:
 *   • Stable keys, no `undefined`, no missing fields.
 *   • Every monetary string is fixed-4 KD ("0.0000").
 *   • Empty arrays instead of null when there is nothing to show.
 *   • `topRisk` is the only nullable top-level field — by design, the
 *     classifier may decide there is no actionable top risk.
 *
 * What this endpoint deliberately does NOT do:
 *   • No business-logic computation.
 *   • No re-aggregation of flows or snapshots.
 *   • No mutation, no queue publish, no notification.
 *   • No re-derivation of the traffic light or any severity.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClassifiedAlertDto,
  ClassifiedDriverStatus,
  ClassifiedTrafficLight,
} from './cash-classified.dto';
import { ExecutiveTopRiskDto } from './cash-executive.dto';

export class CashDashboardAlertsDto {
  @ApiProperty({
    type: () => ClassifiedAlertDto,
    isArray: true,
    description:
      'Money-risk alerts (drive the dashboard color). Mirrors `classified.financialAlerts` verbatim.',
  })
  financial!: ClassifiedAlertDto[];

  @ApiProperty({
    type: () => ClassifiedAlertDto,
    isArray: true,
    description:
      'Operational compliance items. NEVER escalate the dashboard. Mirrors `classified.complianceAlerts` verbatim.',
  })
  compliance!: ClassifiedAlertDto[];
}

export class CashDashboardDriverDto {
  @ApiProperty()
  driverId!: string;

  @ApiProperty({
    description:
      'Display name for the dashboard. Falls back to driverId when the classifier has no name on file (still never null).',
  })
  name!: string;

  @ApiProperty({
    description:
      'Per-driver cash residue (KD, 4 decimals). Reads `classified.drivers[].amount` verbatim — no recomputation.',
  })
  totalCash!: string;

  @ApiProperty({
    enum: ['NORMAL', 'COMPLIANCE_ONLY', 'AT_RISK'],
    description: 'Inherited from `classified.drivers[].status`.',
  })
  status!: ClassifiedDriverStatus;

  @ApiProperty({
    description:
      'Hours since the OLDEST live cash unit attributed to this driver. Inherited from `classified.drivers[].cashAgeHours`.',
  })
  oldestAgeHours!: number;
}

/**
 * Per-branch SSoT slice. Branch cash is DERIVED from
 * `ManagerCashCustody` (driver -> branch transfers) and
 * `BankDepositLog` (branch -> bank). This DTO mirrors the
 * `BranchCashLedgerService.project()` row verbatim -- no
 * recomputation, no per-row aggregation in the composer.
 */
export class CashDashboardBranchDto {
  @ApiProperty()
  branchId!: string;

  @ApiProperty({
    description:
      'Branch display name. Falls back to branchId when the lookup has no row (still never null).',
  })
  name!: string;

  @ApiProperty({
    description:
      'Cash currently held by the branch (KD, 4 decimals). = SUM(custody.amountKd) over open bags whose status is in {PENDING_DEPOSIT, AWAITING_VERIFICATION, VERIFIED} AND whose linked BankDepositLog does not yet exist. NEVER computed from invoices.',
  })
  currentBranchCash!: string;

  @ApiProperty({
    description:
      'Number of open custody bags contributing to currentBranchCash.',
  })
  openBagCount!: number;
}

/**
 * Top-level branch summary slice. Surfaces the SSoT total branch cash
 * AND any unattributed cash so the operator can see -- not silently
 * inherit -- legacy data quality issues.
 */
export class CashDashboardBranchSummaryDto {
  @ApiProperty({
    type: () => CashDashboardBranchDto,
    isArray: true,
    description:
      'Per-branch projection. Sorted by currentBranchCash DESC, then by name ASC.',
  })
  rows!: CashDashboardBranchDto[];

  @ApiProperty({
    description:
      'Σ branches[].currentBranchCash, fixed-4 KD. The SSoT total of cash currently in branch hands across the whole system.',
  })
  totalCurrentBranchCash!: string;

  @ApiProperty({
    description:
      'Cash in custody bags with NO branchId (legacy). Surfaced explicitly so it cannot be silently merged into a branch number. Operators must investigate -- the dashboard does not auto-resolve.',
  })
  unattributedCustodyKd!: string;

  @ApiProperty({
    description: 'Number of unattributed-custody bags.',
  })
  unattributedCustodyBagCount!: number;
}

export class CashDashboardResponseDto {
  @ApiProperty({
    enum: ['GREEN', 'YELLOW', 'RED'],
    description:
      'Inherited verbatim from `classified.systemStatus` — the only sanctioned producer of the traffic light.',
  })
  systemStatus!: ClassifiedTrafficLight;

  @ApiProperty({
    description:
      'Σ classified.drivers[].amount, KD fixed-4 decimals. NEVER computed independently from flows or snapshot.summary.',
  })
  totalCash!: string;

  @ApiProperty({
    description:
      'Arabic operator label derived ONLY from `systemStatus`. GREEN → "مستقر", YELLOW → "انتباه تشغيلي", RED → "خطر مالي".',
  })
  summaryText!: string;

  @ApiProperty({
    type: () => CashDashboardAlertsDto,
    description: 'Both alert buckets, exactly as the classifier emits them.',
  })
  alerts!: CashDashboardAlertsDto;

  @ApiProperty({
    type: () => CashDashboardDriverDto,
    isArray: true,
    description:
      'Direct projection of `classified.drivers`. The order matches the classifier; the frontend may sort for display but MUST NOT recompute totals.',
  })
  drivers!: CashDashboardDriverDto[];

  @ApiProperty({
    type: () => CashDashboardBranchSummaryDto,
    description:
      'SSoT branch-cash slice. Branch cash is DERIVED from custody bags + bank deposits via BranchCashLedgerService; the frontend MUST read these values verbatim and NEVER aggregate from invoices or order totals.',
  })
  branches!: CashDashboardBranchSummaryDto;

  @ApiPropertyOptional({
    type: () => ExecutiveTopRiskDto,
    nullable: true,
    description:
      'Verbatim `executive.topRisk`. Null when there is no actionable top risk — never recomputed here.',
  })
  topRisk!: ExecutiveTopRiskDto | null;

  @ApiProperty({
    description: 'ISO timestamp the dashboard payload was assembled.',
  })
  generatedAt!: string;

  @ApiProperty({ description: 'Always true.' })
  readOnly!: true;

  @ApiProperty({ description: 'Always true.' })
  advisoryOnly!: true;
}
