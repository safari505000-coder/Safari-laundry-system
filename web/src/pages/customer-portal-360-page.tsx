import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { Customer360Panel } from '@/modules/call-center/components/customer-360-panel';

/**
 * B2C Customer 360 — uses JWT `linkedCustomerId`; never accepts a different
 * id from the URL (path is implicit from session).
 */
export function CustomerPortal360Page() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const customerId = user?.linkedCustomerId?.trim() ?? '';

  if (!user || user.safariRole !== 'CUSTOMER') {
    return <Navigate to="/403" replace />;
  }
  if (!customerId) {
    return <Navigate to="/403" replace />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('customerPortal.title', 'My account')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('customerPortal.subtitle', 'Overview of your plan, usage, and balances.')}
        </p>
      </header>
      <Customer360Panel token={token} customerId={customerId} expectInternal={false} />
    </div>
  );
}
