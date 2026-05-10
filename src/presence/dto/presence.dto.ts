import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export const PRESENCE_SCOPE_KINDS = [
  'customer',
  'collection-row',
  'reconciliation-row',
  'order',
] as const;

export type PresenceScopeKindDto = (typeof PRESENCE_SCOPE_KINDS)[number];

export class HeartbeatBodyDto {
  @ApiProperty({
    description: 'Operational scope kind. Visibility-only — no business effect.',
    enum: PRESENCE_SCOPE_KINDS,
    example: 'customer',
  })
  @IsString()
  @IsIn(PRESENCE_SCOPE_KINDS as unknown as string[])
  scopeKind!: PresenceScopeKindDto;

  @ApiProperty({
    description: 'Identifier of the record the operator is currently viewing.',
    example: '7c1c3a15-ca1f-429b-8bfa-24e85e990ef2',
  })
  @IsString()
  @MinLength(1)
  scopeId!: string;
}

export class HeartbeatResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty()
  safariRole!: string;

  @ApiProperty({ nullable: true })
  branchId!: string | null;

  @ApiProperty({ enum: PRESENCE_SCOPE_KINDS })
  scopeKind!: PresenceScopeKindDto;

  @ApiProperty()
  scopeId!: string;

  @ApiProperty({
    description: 'ISO timestamp of the last heartbeat acceptance.',
  })
  lastSeenAt!: string;
}

export class PresenceListResponseDto {
  @ApiProperty({ type: [HeartbeatResponseDto] })
  operators!: HeartbeatResponseDto[];

  @ApiProperty({
    description:
      'Server timestamp at which this snapshot was produced. Lets the client age out entries during a transient disconnect.',
  })
  computedAt!: string;
}
