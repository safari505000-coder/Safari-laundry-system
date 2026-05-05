/**
 * System Guardian — autonomous platform health watcher.
 *
 * The Guardian sweeps every 5 minutes (and can be triggered on demand)
 * across cash integrity, regression scenarios, API latency, queue
 * health and UI-vs-backend consistency. Findings are aggregated into
 * a single severity, deduplicated within a 10-minute window, and only
 * pushed to the OWNER's WhatsApp when they exceed the configured
 * thresholds.
 *
 * STRICT contract:
 *   - READ-ONLY: never writes to Prisma, never touches the execution
 *     tracker, never enqueues a job (other than the WhatsApp notify
 *     which is the explicit purpose of this layer).
 *   - The output below is what `GET /api/system-guardian/status` and
 *     `POST /api/system-guardian/run` return.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type GuardianSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type GuardianRunStatus = 'OK' | 'ISSUES_FOUND';

export type GuardianCheckId =
  | 'CASH_INTEGRITY'
  | 'REGRESSION_GUARD'
  | 'DRIVER_CONSISTENCY'
  | 'FLOW_CHAIN'
  | 'API_HEALTH'
  | 'QUEUE_HEALTH'
  | 'UI_CONSISTENCY';

export class GuardianIssueDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  severity!: GuardianSeverity;

  @ApiProperty()
  check!: GuardianCheckId;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({ nullable: true })
  driverId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  driverName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expected!: string | null;

  @ApiPropertyOptional({ nullable: true })
  found!: string | null;

  @ApiPropertyOptional({ nullable: true })
  delta!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  context!: Record<string, string> | null;

  @ApiProperty({ description: 'ISO-8601 timestamp the issue was first observed.' })
  firstSeenAt!: string;

  @ApiProperty({ description: 'ISO-8601 timestamp of the latest observation.' })
  lastSeenAt!: string;

  @ApiProperty({ description: 'How many times this issue (by stable key) has been observed in the rolling window.' })
  occurrences!: number;
}

export class GuardianHealthSnapshotDto {
  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true })
  classified!: string | null;

  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true })
  risk!: string | null;

  @ApiProperty({ enum: ['GREEN', 'YELLOW', 'RED'], nullable: true })
  executive!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Roundtrip ms for /classified.' })
  classifiedLatencyMs!: number | null;

  @ApiPropertyOptional({ nullable: true })
  riskLatencyMs!: number | null;

  @ApiPropertyOptional({ nullable: true })
  executiveLatencyMs!: number | null;
}

export class GuardianAlertHistoryEntryDto {
  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ enum: ['OK', 'ISSUES_FOUND'] })
  status!: GuardianRunStatus;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  severity!: GuardianSeverity;

  @ApiProperty()
  issuesCount!: number;

  @ApiProperty({ description: 'Was a WhatsApp message dispatched on this sweep?' })
  sentToWhatsApp!: boolean;

  @ApiPropertyOptional({ nullable: true })
  whatsAppError!: string | null;
}

export class GuardianResponseDto {
  @ApiProperty({ enum: ['OK', 'ISSUES_FOUND'] })
  status!: GuardianRunStatus;

  @ApiProperty({ enum: ['INFO', 'WARNING', 'CRITICAL'] })
  severity!: GuardianSeverity;

  @ApiProperty({ type: [GuardianIssueDto] })
  issues!: GuardianIssueDto[];

  @ApiProperty()
  health!: GuardianHealthSnapshotDto;

  @ApiProperty({ description: 'True if at least one WhatsApp message was dispatched as part of this sweep.' })
  sentToWhatsApp!: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Error from the WhatsApp provider if delivery failed.' })
  whatsAppError!: string | null;

  @ApiProperty()
  timestamp!: string;

  @ApiProperty()
  durationMs!: number;

  @ApiProperty({ description: 'True — Guardian never writes to Prisma.' })
  readOnly!: true;
}

export class GuardianStatusResponseDto extends GuardianResponseDto {
  @ApiProperty({ type: [GuardianAlertHistoryEntryDto], description: 'Last 20 sweep summaries (newest first).' })
  history!: GuardianAlertHistoryEntryDto[];

  @ApiProperty({ description: 'Whether a WhatsApp provider is configured (Moatmt creds OR webhook).' })
  whatsAppConfigured!: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Masked owner phone (e.g. 965****1855) — exposed for visibility, never the full number.' })
  ownerPhoneMasked!: string | null;

  @ApiProperty({
    enum: ['database', 'env', 'none'],
    description:
      'Where the active alert recipient was resolved from (DB → env → none). `none` means the Guardian will skip WhatsApp delivery on the next sweep.',
  })
  ownerPhoneSource!: 'database' | 'env' | 'none';
}
