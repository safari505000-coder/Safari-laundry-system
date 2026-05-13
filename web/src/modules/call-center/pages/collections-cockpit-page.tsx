import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import { CollectionsCockpitView } from '@/modules/call-center/pages/collections-cockpit-view';

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
