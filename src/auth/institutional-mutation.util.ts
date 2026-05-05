import { ForbiddenException } from '@nestjs/common';
import { SafariRole } from '@prisma/client';

/**
 * V19.30 — Second-line defense: blocks GENERAL_MANAGER from service-layer
 * mutations so internal callers cannot bypass {@link GeneralManagerReadOnlyGuard}.
 */
export function assertInstitutionalMutationAllowed(
  role: SafariRole | string | null | undefined,
): void {
  const r =
    typeof role === 'string' ?
      role.trim().toUpperCase()
    : role === null || role === undefined ?
      ''
    : String(role).trim().toUpperCase();
  if (r === SafariRole.GENERAL_MANAGER || r === 'GENERAL_MANAGER') {
    throw new ForbiddenException('Read-only role');
  }
}
