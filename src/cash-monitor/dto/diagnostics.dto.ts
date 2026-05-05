/**
 * Diagnostics — operator-facing explanation layer.
 *
 * The diagnostic engine does NOT detect issues; it CONSUMES the
 * issues already detected by:
 *
 *   • SystemGuardianService          (`/system-guardian/status`)
 *   • IntegrityAuditService           (`/cash-intelligence/integrity-audit`)
 *   • DriverAmountAuditService        (`/cash-intelligence/driver-amount-audit`)
 *
 * For each issue it produces:
 *
 *   1. A canonical `issueType` string.
 *   2. The driver / layer values that disagree.
 *   3. Exactly ONE root cause from the closed taxonomy below.
 *   4. A severity tier (CRITICAL or WARNING).
 *   5. A plain-Arabic explanation an operations manager can act on.
 *   6. A concrete recommended action.
 *   7. A human-readable formatted block in the EXACT shape the
 *      operator expects on WhatsApp / dashboard ticker.
 *
 * STRICT contract:
 *   - READ-ONLY. The engine never mutates state, never re-runs the
 *     classifier, never invents data.
 *   - Deterministic — same input always yields the same diagnosis.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Closed root-cause taxonomy defined by the spec. Pick exactly one. */
export type DiagnosticRootCause =
  | 'SNAPSHOT_DRIFT'
  | 'CLASSIFICATION_MISMATCH'
  | 'CACHE_STALE'
  | 'MAPPING_ERROR'
  | 'AGGREGATION_BUG'
  | 'AMOUNT_FLOOR_VIOLATION'
  | 'AGE_GATE_VIOLATION'
  | 'UNKNOWN';

export type DiagnosticSource =
  | 'GUARDIAN'
  | 'INTEGRITY_AUDIT'
  | 'DRIVER_AMOUNT_AUDIT';

export type DiagnosticSeverity = 'CRITICAL' | 'WARNING';

export class DiagnosticValuesDto {
  @ApiPropertyOptional({ nullable: true })
  classified!: string | null;

  @ApiPropertyOptional({ nullable: true })
  risk!: string | null;

  @ApiPropertyOptional({ nullable: true })
  executive!: string | null;

  @ApiPropertyOptional({ nullable: true })
  live!: string | null;

  @ApiPropertyOptional({ nullable: true })
  operational!: string | null;
}

export class DiagnosticItemDto {
  @ApiProperty({ description: 'Stable id derived from the source issue.' })
  id!: string;

  @ApiProperty({ enum: ['GUARDIAN', 'INTEGRITY_AUDIT', 'DRIVER_AMOUNT_AUDIT'] })
  source!: DiagnosticSource;

  @ApiProperty({ description: 'Canonical, machine-readable issue label.' })
  issueType!: string;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ enum: ['CRITICAL', 'WARNING'] })
  severity!: DiagnosticSeverity;

  @ApiProperty({
    type: () => DiagnosticValuesDto,
    description:
      'Per-layer numbers/states the engine compared. KD strings (4 dp) for amounts, status strings for traffic lights.',
  })
  values!: DiagnosticValuesDto;

  @ApiProperty({
    description:
      'max(value) - min(value) — KD when numeric, blank string when the comparison was symbolic (status drift).',
  })
  delta!: string;

  @ApiProperty({
    enum: [
      'SNAPSHOT_DRIFT',
      'CLASSIFICATION_MISMATCH',
      'CACHE_STALE',
      'MAPPING_ERROR',
      'AGGREGATION_BUG',
      'AMOUNT_FLOOR_VIOLATION',
      'AGE_GATE_VIOLATION',
      'UNKNOWN',
    ],
  })
  rootCause!: DiagnosticRootCause;

  @ApiProperty({ description: 'Plain-Arabic explanation written for operations managers.' })
  explanationAr!: string;

  @ApiProperty({ description: 'Exact recommended action.' })
  action!: string;

  @ApiProperty({ description: 'When the diagnosis ran (ISO).' })
  timestamp!: string;

  @ApiProperty({
    description:
      'Pre-rendered Arabic block (🚨 SYSTEM ALERT …) — feed directly to WhatsApp / dashboard ticker.',
  })
  formatted!: string;
}

export class DiagnosticsSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  critical!: number;

  @ApiProperty()
  warning!: number;

  @ApiProperty({
    description:
      'How many distinct root causes are represented. Useful to spot when one upstream bug is responsible for many symptoms.',
  })
  uniqueRootCauses!: number;
}

export class DiagnosticsResponseDto {
  @ApiProperty({ type: [DiagnosticItemDto] })
  items!: DiagnosticItemDto[];

  @ApiProperty({ type: () => DiagnosticsSummaryDto })
  summary!: DiagnosticsSummaryDto;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ description: 'Always true — diagnostic engine never writes.' })
  readOnly!: true;
}
