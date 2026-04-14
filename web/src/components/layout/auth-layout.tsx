import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Drivers only use `/pos` (full-screen POS). Everyone else uses nested routes under `ExecutiveShell`.
 */
export function AuthLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.safariRole === 'DRIVER') {
    if (pathname !== '/pos') {
      return <Navigate to="/pos" replace />;
    }
    return <Outlet />;
  }

  if (pathname === '/pos') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
