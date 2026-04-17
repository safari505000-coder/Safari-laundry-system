import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import type { SafariRole } from '@/lib/api';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';

export function RequireRoles({
  roles,
  children,
}: {
  roles: SafariRole[];
  children: ReactNode;
}) {
  const { user, hasRole } = useAuth();
  if (hasMasterIslandAccess(user)) {
    return <>{children}</>;
  }
  if (!hasRole(...roles)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
