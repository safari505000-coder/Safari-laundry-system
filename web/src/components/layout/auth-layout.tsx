import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Drivers only use `/pos` (full-screen POS). Everyone else uses nested routes under `ExecutiveShell`.
 */
export function AuthLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const driverAllowed = ['/pos', '/my-daily-sales', '/my-cash-custody'];

  if (user?.safariRole === 'DRIVER') {
    if (!driverAllowed.includes(pathname)) {
      return <Navigate to="/pos" replace />;
    }
    return <Outlet />;
  }

  if (pathname === '/pos' && user?.safariRole !== 'MANAGER' && user?.safariRole !== 'OWNER') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
