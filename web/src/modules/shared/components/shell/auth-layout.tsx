import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { MobileBottomNav } from '@/modules/shared/components/shell/mobile-bottom-nav';

/**
 * Paths the DRIVER island is allowed to render. Anything outside this
 * list short-circuits to /pos to keep drivers on the shop floor.
 *
 * NOTE (V3.8 fix): the `/driver/*` prefix is whitelisted wholesale so
 * that future driver-only pages under that namespace (e.g. the new
 * Field Collection Tracker `/driver/pending-invoices`) do not require
 * another edit to this file. Without the prefix branch, clicking the
 * sidebar entry bounced drivers straight to `/pos`.
 *
 * V19.22.1 — added `/my-cash-receipts` (سندات الاستلام، + printable
 * voucher subroute `:id/print`) and `/my/debt-transfers` (Driver inbox
 * of debt-transfer documents awaiting their signature, Dastur §5).
 * Both entries already appear in the driver sidebar but were missing
 * here, which silently bounced the driver to `/pos` before
 * `RequireAccess` could even run.
 */
const DRIVER_EXACT_PATHS = new Set([
  '/pos',
  '/my-daily-sales',
  '/my-cash-custody',
  '/my-deposits',
  '/my-field-expenses',
  '/my-cash-receipts',
  '/my/debt-transfers',
]);

const SECURITY_LOCKED_PATHS = new Set(['/collections', '/whatsapp-tools']);

const DRIVER_PATH_PREFIXES = [
  '/driver/',
  '/my-cash-receipts/',
  '/my/debt-transfers/',
];

/** V19.26 — same route as `ExecutiveShell` `invoices/:orderId/print` (OrderRow, daily sales). */
const DRIVER_INVOICE_PRINT_RE = /^\/invoices\/[^/]+\/print$/;

function isDriverAllowedPath(pathname: string): boolean {
  if (DRIVER_EXACT_PATHS.has(pathname)) return true;
  if (DRIVER_INVOICE_PRINT_RE.test(pathname)) return true;
  return DRIVER_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Drivers only use full-screen island routes. Everyone else uses nested routes under `ExecutiveShell`.
 */
export function AuthLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.safariRole === 'DRIVER') {
    if (SECURITY_LOCKED_PATHS.has(pathname)) {
      return <Navigate to="/403" replace />;
    }
    if (!isDriverAllowedPath(pathname)) {
      return <Navigate to="/pos" replace />;
    }
    // Driver POS (`/pos`) has its own menu sheet; `MobileBottomNav` hides
    // there to avoid a second hamburger over the field header. Everywhere
    // else (ExecutiveShell: مصروف، عهدة، …) the drawer is the only mobile nav.
    return (
      <>
        <Outlet />
        <MobileBottomNav />
      </>
    );
  }

  // Dastur — POS is for field operators only. DRIVER already branches
  // above into DriverPOS; here we allow MANAGER through to the back-office
  // PosPage and bounce everyone else (including OWNER/GM) home. The server
  // side is already guarded by `pos.use` (`RequireAccess` on /pos), this
  // layout check is a second safety net for stale bookmarks.
  if (pathname === '/pos' && user?.safariRole !== 'MANAGER') {
    return <Navigate to="/" replace />;
  }

  /*
   * V19.4 — Render the bottom bar at the layout level so it persists
   * across every authenticated route (including `/pos` and
   * `/admin/live-monitor`, which bypass `ExecutiveShell`). This fixes
   * the "tab bar shows then disappears" report on mobile.
   */
  return (
    <>
      <Outlet />
      <MobileBottomNav />
    </>
  );
}
