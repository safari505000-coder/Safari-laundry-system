import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { DriverPOS } from '@/modules/driver/pages/DriverPOS';
import { PosPage } from '@/pages/pos-page';

/**
 * Dastur — `/pos` has exactly two consumers:
 *   • DRIVER  → field POS (DriverPOS variant)
 *   • MANAGER → back-office POS (PosPage)
 * Any other role that reaches this route (e.g. via a stale bookmark when
 * their role was just downgraded) is redirected home. `RequireAccess`
 * with `pos.use` catches unauthenticated / wrong-role access at the route
 * guard level too; this component is the rendering fallback.
 */
export function PosRoute() {
  const { user } = useAuth();
  if (user?.safariRole === 'DRIVER') return <DriverPOS />;
  if (user?.safariRole === 'MANAGER') return <PosPage />;
  return <Navigate to="/" replace />;
}
