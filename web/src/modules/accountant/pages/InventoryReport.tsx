import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PackagePlus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { InventoryReportView } from '@/modules/shared/components/inventory/inventory-report-view';
import { Button } from '@/modules/shared/components/ui/button';
import { can } from '@/modules/shared/auth/access-matrix';

/** Accountant island — Smart Inventory view + quick [Stock-In] action. */
export default function AccountantInventoryReportPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  if (!token) return null;

  // Access to the page is already enforced by <RequireAccess access="inventoryReport.view">
  // in App.tsx. Stock-In is a stricter capability gated by the matrix.
  const canStockIn = can(user, 'inventoryReport.stockIn');

  return (
    <InventoryReportView
      token={token}
      subtitle={t('inventory.report.accountantSubtitle')}
      headerActions={
        canStockIn ? (
          <Button
            type="button"
            className="gap-2"
            onClick={() => navigate('/accountant/stock-in')}
          >
            <PackagePlus className="h-4 w-4" />
            {t('inventory.stockIn.cta')}
          </Button>
        ) : null
      }
      rowAction={
        canStockIn
          ? ({ stockItemId, branchId }) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(
                    `/accountant/stock-in?itemId=${encodeURIComponent(stockItemId)}&branchId=${encodeURIComponent(branchId)}`,
                  )
                }
              >
                {t('inventory.stockIn.rowAction')}
              </Button>
            )
          : undefined
      }
    />
  );
}
