import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

const DRIVER_PATHS = [
  '/pos',
  '/my-daily-sales',
  '/my-cash-custody',
  '/my-deposits',
  '/my-field-expenses',
];

/**
 * Drivers only use full-screen island routes. Everyone else uses nested routes under `ExecutiveShell`.
 */
export function AuthLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.safariRole === 'DRIVER') {
    if (!DRIVER_PATHS.includes(pathname)) {
      return <Navigate to="/pos" replace />;
    }
    return <Outlet />;
  }

  if (pathname === '/pos' && user?.safariRole !== 'MANAGER' && user?.safariRole !== 'OWNER') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
