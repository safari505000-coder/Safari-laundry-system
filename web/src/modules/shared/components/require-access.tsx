import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { ACCESS, type AccessKey } from '@/modules/shared/auth/access-matrix';

/**
 * Route / subtree guard that reads its allowed-roles list from the
 * single source of truth in `access-matrix.ts`.
 *
 * Prefer this over `<RequireRoles>` everywhere new; the matrix spells
 * out OWNER / GENERAL_MANAGER on every key they should reach, so there
 * is no implicit "master island" bypass any more.
 */
export function RequireAccess({
  access,
  children,
}: {
  access: AccessKey;
  children: ReactNode;
}) {
  const { user, hasRole } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(...ACCESS[access])) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
