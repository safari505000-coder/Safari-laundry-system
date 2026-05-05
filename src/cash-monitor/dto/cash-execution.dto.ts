/**
 * Cash Execution Tracking — DTOs.
 *
 * The execution layer is the FIRST writeable surface in the cash
 * intelligence stack. Its writes are STRICTLY operational:
 *
 *   - We track WHO took WHICH advisory action (CONTACTED /
 *     FOLLOWED_UP / ESCALATED) on which driver.
 *   - We DO NOT touch a single financial number, ledger row, audit
 *     log, payment, deposit, or custody bag.
 *   - State lives in process memory (Map). On restart, the system
 *     gracefully re-derives "OPEN" from the next snapshot.
 *
 * These DTOs describe the wire format; see
 * `cash-execution-tracker.service.ts` for the in-memory contract.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export type CashExecutionStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED';

export type CashExecutionAction =
  | 'CONTACTED'
  | 'FOLLOWED_UP'
  | 'ESCALATED';

/**
 * POST /api/cash-intelligence/action body.
 *
 * Validation:
 *   - `driverId`  : non-empty string (UUID-shaped, but we tolerate
 *     other id formats so test fixtures still work).
 *   - `action`    : one of CONTACTED / FOLLOWED_UP / ESCALATED.
 *   - `note`      : optional, capped at 500 characters so the
 *     in-memory store cannot be flooded.
 */
export class CashExecutionActionRequestDto {
  @ApiProperty({ description: 'Driver the action targets.' })
  @IsString()
  @Length(1, 200)
  driverId!: string;

  @ApiProperty({ enum: ['CONTACTED', 'FOLLOWED_UP', 'ESCALATED'] })
  @IsIn(['CONTACTED', 'FOLLOWED_UP', 'ESCALATED'])
  action!: CashExecutionAction;

  @ApiPropertyOptional({
    description: 'Free-text operator note (e.g. "called twice, no answer").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Optional alertType the action was triggered from. Stored verbatim for traceability.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  alertType?: string;
}

/**
 * Execution block embedded in the topRisk payload of `/executive` when
 * the topRisk's driver has a tracking record.
 */
export class CashExecutionBlockDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] })
  status!: CashExecutionStatus;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['CONTACTED', 'FOLLOWED_UP', 'ESCALATED', null],
  })
  lastAction!: CashExecutionAction | null;

  @ApiPropertyOptional({ nullable: true })
  lastActionAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastActor!: string | null;

  @ApiProperty({ description: 'Times this driver entered the at-risk set today (Asia/Kuwait).' })
  flagsToday!: number;

  @ApiProperty({ description: 'Times this driver entered the at-risk set in the last 7 days.' })
  flagsThisWeek!: number;

  @ApiProperty({ description: 'True when flagsThisWeek > 3.' })
  repeatIssue!: boolean;
}

/**
 * The response body of the action POST is a small confirmation that
 * the operator can render in a toast. It mirrors the execution block
 * so the UI does not need a follow-up GET.
 */
export class CashExecutionActionResponseDto {
  @ApiProperty()
  driverId!: string;

  @ApiProperty()
  recordedAt!: string;

  @ApiProperty()
  execution!: CashExecutionBlockDto;

  @ApiProperty({ description: 'Always true — no financial state was changed.' })
  readOnlyFinancial!: true;
}
