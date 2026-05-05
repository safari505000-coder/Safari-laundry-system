import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * V19.x — Read-shape for a single dispatch row.
 *
 * The `severity` field is COMPUTED ON THE BACKEND on every read from
 * `now() - createdAt`, NEVER persisted. The frontend must render the
 * field as-is and never recompute it from raw timestamps (Single
 * Source of Truth: the server clock).
 *
 * Thresholds are deliberately conservative and match the brief:
 *   - elapsedMs <  10 minutes  → 'ON_TIME'
 *   - elapsedMs >= 10 minutes  → 'LATE'
 *   - elapsedMs >= 20 minutes  → 'CRITICAL'
 *
 * Once the dispatch is COMPLETED, severity is reported as 'COMPLETED'
 * to keep the UI badge mapping pure (no nullable string).
 */
export type DispatchSeverity = 'ON_TIME' | 'LATE' | 'CRITICAL' | 'COMPLETED';

export class DispatchRowDto {
  @ApiProperty({ example: '33333333-3333-3333-3333-333333333333' })
  id!: string;

  @ApiProperty({ enum: ['ASSIGNED', 'COMPLETED'] })
  status!: 'ASSIGNED' | 'COMPLETED';

  @ApiProperty({
    description:
      'Computed live from server clock; never persisted. Thresholds: <10m ON_TIME, ≥10m LATE, ≥20m CRITICAL. COMPLETED short-circuits.',
    enum: ['ON_TIME', 'LATE', 'CRITICAL', 'COMPLETED'],
  })
  severity!: DispatchSeverity;

  @ApiProperty({
    description:
      'Whole minutes elapsed since createdAt (or since createdAt → completedAt for closed rows). Server-computed.',
  })
  elapsedMinutes!: number;

  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  customerDisplay!: string;

  @ApiProperty()
  customerPhone!: string;

  @ApiProperty()
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiPropertyOptional({ nullable: true })
  instructionNote!: string | null;

  @ApiProperty()
  createdAtIso!: string;

  @ApiPropertyOptional({ nullable: true })
  completedAtIso!: string | null;

  @ApiPropertyOptional({ nullable: true })
  completedByOrderId!: string | null;
}

/**
 * Snapshot returned by `GET /api/call-center/dispatch/active` and the
 * sibling driver/me endpoint. The wrapper exposes the same
 * `generatedAtIso` stamp the rest of the UI uses to render relative
 * timestamps without ever calling `Date.now()` in the renderer.
 */
export class DispatchSnapshotDto {
  @ApiProperty({
    description:
      'Server clock at projection time. Frontend MUST use this as the reference for all relative-time UI (≪ NOT new Date()).',
  })
  generatedAtIso!: string;

  @ApiProperty({ type: () => [DispatchRowDto] })
  rows!: DispatchRowDto[];
}
