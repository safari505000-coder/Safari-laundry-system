import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * V19.x — Body for `POST /api/call-center/dispatch/:id/reassign`.
 *
 * Mirrors `CreateDispatchDto` minus the customerId (which is taken
 * from the parent dispatch) and adds an optional `reason` the agent
 * can supply for the audit trail / driver-facing instructionNote.
 *
 * No `accept` / `cancel` fields — the parent stays ASSIGNED on
 * purpose, and only an Order can close any dispatch in the chain.
 */
export class ReassignDispatchDto {
  @ApiProperty({
    description:
      'New driver assignee. Must be active, role DRIVER, and not equal to the current driver.',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsUUID('4')
  newDriverId!: string;

  @ApiPropertyOptional({
    description:
      'Optional reason. Stored on the successor dispatch as `instructionNote` and embedded in the DISPATCH_REASSIGNED audit row.',
    example: 'السائق الأول لم يصل خلال 25 دقيقة',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
