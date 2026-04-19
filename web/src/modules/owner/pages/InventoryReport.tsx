import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { InventoryReportView } from '@/modules/shared/components/inventory/inventory-report-view';

/** Owner island — read-only Smart Inventory view (Dastur §4). */
export default function OwnerInventoryReportPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();

  if (!hasRole('OWNER', 'GENERAL_MANAGER')) return <Navigate to="/" replace />;
  if (!token) return null;

  return (
    <InventoryReportView
      token={token}
      subtitle={t('inventory.report.ownerSubtitle')}
    />
  );
}
