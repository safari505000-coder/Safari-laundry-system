import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';

/**
 * Paths the DRIVER island is allowed to render. Anything outside this
 * list short-circuits to /pos to keep drivers on the shop floor.
 *
 * NOTE (V3.8 fix): the `/driver/*` prefix is whitelisted wholesale so
 * that future driver-only pages under that namespace (e.g. the new
 * Field Collection Tracker `/driver/pending-invoices`) do not require
 * another edit to this file. Without the prefix branch, clicking the
 * sidebar entry bounced drivers straight to `/pos`.
 */
const DRIVER_EXACT_PATHS = new Set([
  '/pos',
  '/my-daily-sales',
  '/my-cash-custody',
  '/my-deposits',
  '/my-field-expenses',
]);

const DRIVER_PATH_PREFIXES = ['/driver/'];

function isDriverAllowedPath(pathname: string): boolean {
  if (DRIVER_EXACT_PATHS.has(pathname)) return true;
  return DRIVER_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Drivers only use full-screen island routes. Everyone else uses nested routes under `ExecutiveShell`.
 */
export function AuthLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.safariRole === 'DRIVER') {
    if (!isDriverAllowedPath(pathname)) {
      return <Navigate to="/pos" replace />;
    }
    return <Outlet />;
  }

  if (pathname === '/pos' && user?.safariRole !== 'MANAGER' && user?.safariRole !== 'OWNER') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
