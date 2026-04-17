import { useAuth } from '@/contexts/auth-context';
import { StaffControlReactor } from '@/modules/shared/reactors/StaffControlReactor';
import { OwnerProfitRadar } from '@/modules/owner/pages/OwnerProfitRadar';

export function OwnerDashboard() {
  const { token } = useAuth();

  return (
    <div className="space-y-6">
      <OwnerProfitRadar />
      <StaffControlReactor token={token} />
    </div>
  );
}
