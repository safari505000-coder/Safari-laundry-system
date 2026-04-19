import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { InventoryReportView } from '@/modules/shared/components/inventory/inventory-report-view';

/**
 * Owner island — read-only Smart Inventory view (Dastur §4).
 * Access is enforced at the route level via `inventoryReport.view`.
 */
export default function OwnerInventoryReportPage() {
  const { t } = useTranslation();
  const { token } = useAuth();

  if (!token) return null;

  return (
    <InventoryReportView
      token={token}
      subtitle={t('inventory.report.ownerSubtitle')}
    />
  );
}
