import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const loc = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  return <>{children}</>;
}
