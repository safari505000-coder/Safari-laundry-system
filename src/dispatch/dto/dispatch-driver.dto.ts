import { ApiProperty } from '@nestjs/swagger';

/**
 * V19.x — Lightweight driver row for the call-center dispatch picker.
 *
 * Why so few fields?
 *   - The CALL_CENTER role does NOT have access to the staff
 *     directory (`/api/users` is OWNER/GM/MANAGER/SUPERVISOR-only).
 *     This DTO is the narrow window the dispatch UI is allowed to
 *     see: enough to render a picker, nothing more.
 *   - Phone, employeeId, branch, vehicle, custody balances are all
 *     intentionally excluded. Adding them later requires a parallel
 *     RBAC review.
 *
 * `id` is a UUID string (not a number). The original spec mentioned
 * numeric ids, but every primary key in this Prisma schema is a UUID;
 * we keep the type honest rather than coerce.
 */
export class DispatchDriverDto {
  @ApiProperty({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Driver user UUID — feeds POST /call-center/dispatch.driverId.',
  })
  id!: string;

  @ApiProperty({
    example: 'فهد العنزي',
    description:
      'Display name (User.fullName, falling back to username when empty).',
  })
  name!: string;

  @ApiProperty({
    example: true,
    description:
      'Always true in the current contract — inactive drivers are filtered out at the service layer. Kept on the DTO so a future "show inactive too" query parameter does not require a breaking schema change.',
  })
  isActive!: boolean;

  @ApiProperty({
    example: 2,
    description:
      'Current count of ASSIGNED dispatches held by this driver. The roster is sorted by this value ascending so the least-loaded driver appears first — clients can also surface this number to help the operator pick.',
  })
  activeLoad!: number;
}
