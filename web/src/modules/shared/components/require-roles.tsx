import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import type { SafariRole } from '@/lib/api';

/**
 * @deprecated Prefer {@link RequireAccess} and the access matrix in
 * `modules/shared/auth/access-matrix.ts`. This component is retained
 * only for inline (in-page) role fences that have not been migrated
 * yet; new guards should declare their allowed roles in the matrix.
 *
 * Note: the historical "master island" bypass (OWNER/GM/ADMIN go
 * through every `RequireRoles` silently) has been removed. The matrix
 * now lists OWNER and GENERAL_MANAGER explicitly on every key they can
 * reach, so behaviour is preserved without the magic.
 */
export function RequireRoles({
  roles,
  children,
}: {
  roles: SafariRole[];
  children: ReactNode;
}) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(...roles)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
