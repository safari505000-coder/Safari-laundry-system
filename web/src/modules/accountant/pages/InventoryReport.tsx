import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { PackagePlus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { InventoryReportView } from '@/modules/shared/components/inventory/inventory-report-view';
import { Button } from '@/modules/shared/components/ui/button';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';

/** Accountant island — Smart Inventory view + quick [Stock-In] action. */
export default function AccountantInventoryReportPage() {
  const { t } = useTranslation();
  const { token, user, hasRole } = useAuth();
  const navigate = useNavigate();

  const allowed = hasRole('ACCOUNTANT') || hasMasterIslandAccess(user);
  if (!allowed) return <Navigate to="/" replace />;
  if (!token) return null;

  // Only Accountants can perform stock-in; Owner sees the report read-only.
  const canStockIn = hasRole('ACCOUNTANT');

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
