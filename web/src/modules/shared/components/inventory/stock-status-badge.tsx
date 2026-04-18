import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { InventoryStatus } from '@/lib/api';

/**
 * Dastur §4 stock colour cues:
 *   Green  → IN_STOCK
 *   Yellow → LOW_STOCK (≤ reorder threshold) — Branch Manager alert trigger
 *   Red    → OUT_OF_STOCK (≤ 0)
 */
export function StockStatusBadge({
  status,
  className,
}: {
  status: InventoryStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const style: Record<InventoryStatus, string> = {
    IN_STOCK:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60',
    LOW_STOCK:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/60',
    OUT_OF_STOCK:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900/60',
  };
  const label: Record<InventoryStatus, string> = {
    IN_STOCK: t('inventory.status.inStock'),
    LOW_STOCK: t('inventory.status.lowStock'),
    OUT_OF_STOCK: t('inventory.status.outOfStock'),
  };
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold',
        style[status],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-block h-1.5 w-1.5 rounded-full rtl:ml-1.5 rtl:mr-0',
          status === 'IN_STOCK' && 'bg-emerald-500',
          status === 'LOW_STOCK' && 'bg-amber-500',
          status === 'OUT_OF_STOCK' && 'bg-red-500',
        )}
      />
      {label[status]}
    </span>
  );
}
