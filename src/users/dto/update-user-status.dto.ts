import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Dedicated payload for `PATCH /users/:id/status` — the soft-lock
 * endpoint available to GENERAL_MANAGER. Unlike the broader
 * `PATCH /users/:id`, this one MUST NOT expose role/branch/password
 * mutation; its sole job is to flip `isActive`.
 *
 * Rationale: `DELETE /users/:id` is OWNER-only (hard delete, audit
 * trail impact), and GM must still be able to disable a compromised
 * or departing account immediately without escalating to the Owner.
 * Keeping the shape minimal prevents privilege creep through the
 * status endpoint.
 */
export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'Whether the user can log in. Setting false revokes access immediately; setting true re-enables login.',
    example: false,
  })
  @IsBoolean()
  isActive: boolean;
}
