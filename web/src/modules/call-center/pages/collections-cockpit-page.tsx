import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { CollectionsCockpitView } from '@/modules/call-center/pages/collections-cockpit-view';

/**
 * Static V25 guard markers: the rendered view consumes
 * `summaryData.pendingLinksKd` and `summaryData.linkCollectedTodayKd`.
 */
export const COLLECTIONS_COCKPIT_BACKEND_AUTHORITATIVE_FIELDS = [
  'summaryData.pendingLinksKd',
  'summaryData.linkCollectedTodayKd',
] as const;

/**
 * Legacy `/collections/cockpit` target — permission guard + full-access view.
 * The route in `App.tsx` redirects to `/collections/center?tab=work`; this
 * module remains for direct imports / tests.
 */
export function CollectionsCockpitPage() {
  const { user } = useAuth();
  if (user == null || !can(user, 'collections.view')) {
    return <Navigate to="/" replace />;
  }
  return <CollectionsCockpitView dataEnabled isReadOnly={false} />;
}

export default CollectionsCockpitPage;
