import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, sessionKind } = useAuth();
  const loc = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  if (sessionKind === 'password-change' && loc.pathname !== '/force-change-password') {
    return <Navigate to="/force-change-password" replace />;
  }

  return <>{children}</>;
}
