import { useAuth } from '@/contexts/auth-context';
import { DriverPOS } from '@/modules/driver/pages/DriverPOS';
import { PosPage } from '@/pages/pos-page';

export function PosRoute() {
  const { user } = useAuth();
  if (user?.safariRole === 'DRIVER') return <DriverPOS />;
  return <PosPage />;
}
