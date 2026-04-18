import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  apiJson,
  listInventoryCategories,
  type BranchRow,
  type InventoryCategoryRow,
  type InventoryStatus,
} from '@/lib/api';
import { useInventoryReport } from '@/modules/shared/hooks/use-inventory-report';
import { StockStatusBadge } from './stock-status-badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

const ALL = '__all__';

export type InventoryReportViewProps = {
  token: string;
  /** Role-specific sub-heading under the page title. */
  subtitle?: string;
  /** Role-specific action buttons rendered in the page header (e.g. Stock-In). */
  headerActions?: ReactNode;
  /** Optional per-row action column renderer — omit to hide the column. */
  rowAction?: (ctx: {
    stockItemId: string;
    branchId: string;
    code: string;
    nameAr: string;
    nameEn: string | null;
    unit: string;
  }) => ReactNode;
};

/**
 * Shared Smart Inventory report UI (Dastur §4). Rendered by both
 * `/owner/pages/InventoryReport.tsx` and `/accountant/pages/InventoryReport.tsx`.
 * Each role owns its wrapper page (Islands rule); the data fetching + table
 * markup live here because the view is identical across roles — only the
 * actions differ.
 */
export function InventoryReportView({
  token,
  subtitle,
  headerActions,
  rowAction,
}: InventoryReportViewProps) {
  const { t, i18n } = useTranslation();
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<InventoryStatus | undefined>(undefined);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);

  const filters = useMemo(
    () => ({ categoryId, branchId, status }),
    [categoryId, branchId, status],
  );
  const { data, loading, reload } = useInventoryReport(token, filters);

  useEffect(() => {
    (async () => {
      try {
        const [cats, br] = await Promise.all([
          listInventoryCategories(token),
          apiJson<BranchRow[]>('/api/branches', { token }),
        ]);
        setCategories(cats);
        setBranches(br);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      }
    })();
  }, [token]);

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const isArabic = i18n.language?.startsWith('ar');
  const pickName = (ar: string, en: string | null) =>
    isArabic ? ar : en || ar;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6" aria-hidden />
            {t('inventory.report.title')}
          </h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          <Button
            type="button"
            variant="outline"
            onClick={() => void reload()}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t('inventory.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          label={t('inventory.summary.totalSkus')}
          value={summary?.totalSkus ?? 0}
        />
        <SummaryTile
          label={t('inventory.status.inStock')}
          value={summary?.inStock ?? 0}
          tone="ok"
        />
        <SummaryTile
          label={t('inventory.status.lowStock')}
          value={summary?.lowStock ?? 0}
          tone="warn"
        />
        <SummaryTile
          label={t('inventory.status.outOfStock')}
          value={summary?.outOfStock ?? 0}
          tone="danger"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('inventory.filters.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t('inventory.filters.category')}</Label>
            <Select
              value={categoryId ?? ALL}
              onValueChange={(v) =>
                setCategoryId(!v || v === ALL ? undefined : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('inventory.filters.all')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {pickName(c.nameAr, c.nameEn)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('inventory.filters.branch')}</Label>
            <Select
              value={branchId ?? ALL}
              onValueChange={(v) =>
                setBranchId(!v || v === ALL ? undefined : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('inventory.filters.all')}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('inventory.filters.status')}</Label>
            <Select
              value={status ?? ALL}
              onValueChange={(v) =>
                setStatus(v === ALL ? undefined : (v as InventoryStatus))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('inventory.filters.all')}</SelectItem>
                <SelectItem value="IN_STOCK">
                  {t('inventory.status.inStock')}
                </SelectItem>
                <SelectItem value="LOW_STOCK">
                  {t('inventory.status.lowStock')}
                </SelectItem>
                <SelectItem value="OUT_OF_STOCK">
                  {t('inventory.status.outOfStock')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('inventory.report.table')}
            {summary?.inventoryValueKd ? (
              <span className="ms-3 text-sm font-normal text-muted-foreground">
                {t('inventory.summary.valueKd', {
                  value: summary.inventoryValueKd,
                })}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.col.item')}</TableHead>
                  <TableHead>{t('inventory.col.category')}</TableHead>
                  <TableHead>{t('inventory.col.branch')}</TableHead>
                  <TableHead className="text-end">
                    {t('inventory.col.qty')}
                  </TableHead>
                  <TableHead className="text-end">
                    {t('inventory.col.reorder')}
                  </TableHead>
                  <TableHead className="text-end">
                    {t('inventory.col.unitCost')}
                  </TableHead>
                  <TableHead>{t('inventory.col.status')}</TableHead>
                  {rowAction ? (
                    <TableHead className="text-end">
                      {t('inventory.col.action')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={rowAction ? 8 : 7}
                      className="py-6 text-center"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={rowAction ? 8 : 7}
                      className="py-6 text-center text-muted-foreground"
                    >
                      {t('inventory.report.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div>{pickName(r.nameAr, r.nameEn)}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.code} · {r.unit}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {pickName(
                          r.categoryNameAr ?? '',
                          r.categoryNameEn ?? null,
                        ) || '—'}
                      </TableCell>
                      <TableCell className="text-sm">{r.branchName}</TableCell>
                      <TableCell className="text-end font-mono">
                        {Number(r.quantityOnHand).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-end font-mono text-muted-foreground">
                        {Number(r.reorderPointEffective).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-end font-mono">
                        {r.avgUnitCost
                          ? Number(r.avgUnitCost).toFixed(3)
                          : r.lastUnitCost
                            ? Number(r.lastUnitCost).toFixed(3)
                            : '—'}
                      </TableCell>
                      <TableCell>
                        <StockStatusBadge status={r.status} />
                      </TableCell>
                      {rowAction ? (
                        <TableCell className="text-end">
                          {rowAction({
                            stockItemId: r.stockItemId,
                            branchId: r.branchId,
                            code: r.code,
                            nameAr: r.nameAr,
                            nameEn: r.nameEn,
                            unit: r.unit,
                          })}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger'
          ? 'text-red-600 dark:text-red-400'
          : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
