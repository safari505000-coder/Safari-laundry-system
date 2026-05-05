/**
 * SystemVerify — runtime contract validator output.
 *
 * Returned by `GET /api/cash-intelligence/verify`. Mirrors the
 * read-only audit script (`scripts/audit-cash-intelligence.mjs`) but
 * lives inside the platform so the dashboard can run a manual
 * verification on demand.
 *
 * STRICT contract:
 *   - The endpoint NEVER mutates state. The service synthesises
 *     in-memory `CashIntelligenceAnalysisDto` payloads and feeds them
 *     through `CashClassifierService.composeFromAnalysis` /
 *     `CashRiskService.composeFromAnalysis` /
 *     `CashExecutiveService.compose`. No Prisma writes, no queue
 *     publishes, no DB reads on the synthetic path.
 *   - `readOnly` is a constant `true` so any future caller can assert
 *     the contract on the wire.
 */
import { ApiProperty } from '@nestjs/swagger';

export type SystemVerifyVerdict = 'PASS' | 'FAIL';

export class SystemVerifyCheckDto {
  @ApiProperty({ description: 'Human label for the simulated scenario.' })
  scenario!: string;

  @ApiProperty({
    description:
      'Expected systemStatus for this scenario, encoded with the traffic-light vocabulary the platform uses (GREEN / YELLOW / RED).',
  })
  expected!: 'GREEN' | 'YELLOW' | 'RED';

  @ApiProperty({
    description:
      'Status returned by the classifier for this scenario (single source of truth).',
  })
  classified!: 'GREEN' | 'YELLOW' | 'RED';

  @ApiProperty({
    description:
      'Status returned by /risk for this scenario. Must equal `classified` per the SSoT contract.',
  })
  risk!: 'GREEN' | 'YELLOW' | 'RED';

  @ApiProperty({
    description:
      'Status returned by /executive for this scenario. Must equal `classified` per the SSoT contract.',
  })
  executive!: 'GREEN' | 'YELLOW' | 'RED';

  @ApiProperty({
    description:
      'How many financial alerts the classifier emitted for this scenario.',
  })
  financialAlerts!: number;

  @ApiProperty({
    description:
      'How many compliance alerts the classifier emitted for this scenario.',
  })
  complianceAlerts!: number;

  @ApiProperty({
    description: 'Per-scenario PASS/FAIL — true when every check above held.',
  })
  ok!: boolean;
}

export class SystemVerifyResponseDto {
  @ApiProperty({ enum: ['PASS', 'FAIL'] })
  status!: SystemVerifyVerdict;

  @ApiProperty({
    description:
      'True when at least one check failed. Operators should treat the system as unsafe to ship until this is `false`.',
  })
  blocked!: boolean;

  @ApiProperty({ type: [SystemVerifyCheckDto] })
  checks!: SystemVerifyCheckDto[];

  @ApiProperty({
    type: [String],
    description:
      'Human-readable summary of every contract violation. Empty on PASS.',
  })
  mismatches!: string[];

  @ApiProperty({ description: 'ISO timestamp the verification ran at.' })
  generatedAt!: string;

  @ApiProperty({
    description: 'Always true — the verification path never writes data.',
  })
  readOnly!: true;
}
