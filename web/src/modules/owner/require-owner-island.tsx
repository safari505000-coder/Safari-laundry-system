import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { CAN_MANAGE_STAFF, hasCapability } from '@/modules/shared/auth/capabilities';

/**
 * Owner command center: users with {@link CAN_MANAGE_STAFF} (currently OWNER only).
 * Intentionally does not use the global ADMIN master bypass — extend `hasCapability` for policy changes.
 */
export function RequireOwnerIsland({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (hasCapability(user, CAN_MANAGE_STAFF)) return <>{children}</>;
  return <Navigate to="/" replace />;
}
