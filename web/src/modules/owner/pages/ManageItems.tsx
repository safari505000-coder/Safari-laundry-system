import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { apiJson, ApiError, type BranchRow } from '@/lib/api';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
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

/**
 * Read-only professional catalog view (master list + optional branch merge).
 * Owner island — prices from `LaundryPriceListService`.
 */
export function ManageItems() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [previewBranchId, setPreviewBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !hasRole('OWNER')) return;
    void (async () => {
      try {
        const data = await apiJson<BranchRow[]>('/api/branches', { token });
        setBranches(data);
      } catch (e) {
        if (e instanceof ApiError) {
          /* non-blocking */
        }
        setBranches([]);
      }
    })();
  }, [token, hasRole]);

  const priceList = usePriceList({
    token,
    branchId: previewBranchId,
  });

  const sections = useMemo(() => {
    const byId = new Map<string, typeof priceList.items>();
    for (const it of priceList.items) {
      const id = it.categoryId ?? '';
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id)!.push(it);
    }
    const ordered = [...priceList.categories].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const out: Array<{
      title: string;
      subtitle?: string | null;
      items: typeof priceList.items;
    }> = [];
    for (const c of ordered) {
      const rows = byId.get(c.id);
      if (rows?.length) {
        out.push({
          title: c.nameAr,
          subtitle: c.nameEn,
          items: [...rows].sort((a, b) => a.sortOrder - b.sortOrder),
        });
      }
    }
    const ungrouped = byId.get('');
    if (ungrouped?.length) {
      out.push({
        title: t('manageItems.uncategorized'),
        items: [...ungrouped].sort((a, b) => a.sortOrder - b.sortOrder),
      });
    }
    return out;
  }, [priceList.categories, priceList.items, t]);

  if (!hasRole('OWNER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-[60vh] space-y-6 bg-slate-50/80 p-4 text-slate-900 md:p-6">
      <header className="space-y-1 border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('manageItems.title')}
        </h1>
        <p className="text-sm text-slate-600">{t('manageItems.subtitle')}</p>
      </header>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">
                {t('manageItems.priceScope')}
              </CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                {t('manageItems.priceScopeHint')}
              </p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Label className="text-slate-700">
                {t('manageItems.branchLabel')}
              </Label>
              <Select
                value={previewBranchId ?? 'MASTER'}
                onValueChange={(v) =>
                  setPreviewBranchId(v === 'MASTER' ? null : v)
                }
                disabled={priceList.loading || !branches}
              >
                <SelectTrigger className="border-slate-300 bg-white text-slate-900">
                  <SelectValue placeholder={t('manageItems.branchPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MASTER">
                    {t('manageItems.masterList')}
                  </SelectItem>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {priceList.loading ?
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            </div>
          : priceList.failed ?
            <p className="text-center text-sm text-red-700">
              {t('manageItems.loadFailed')}
            </p>
          : sections.length === 0 ?
            <p className="text-center text-sm text-slate-600">
              {t('manageItems.empty')}
            </p>
          : <div className="space-y-10">
              {sections.map((sec) => (
                <section key={sec.title} className="space-y-3">
                  <div className="border-l-4 border-slate-800 ps-3">
                    <h2 className="text-base font-semibold text-slate-900">
                      {sec.title}
                    </h2>
                    {sec.subtitle ?
                      <p className="text-xs text-slate-500">{sec.subtitle}</p>
                    : null}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-200 bg-slate-100 hover:bg-slate-100">
                          <TableHead className="w-[100px] font-semibold text-slate-800">
                            {t('manageItems.colCode')}
                          </TableHead>
                          <TableHead className="font-semibold text-slate-800">
                            {t('manageItems.colName')}
                          </TableHead>
                          <TableHead className="text-end font-semibold text-slate-800">
                            {t('manageItems.colNormal')}
                          </TableHead>
                          <TableHead className="text-end font-semibold text-slate-800">
                            {t('manageItems.colUrgent')}
                          </TableHead>
                          <TableHead className="text-end font-semibold text-slate-800">
                            {t('manageItems.colPress')}
                          </TableHead>
                          <TableHead className="text-end font-semibold text-slate-800">
                            {t('manageItems.colUrgentPress')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sec.items.map((row) => (
                          <TableRow
                            key={row.id}
                            className="border-slate-100 text-slate-800"
                          >
                            <TableCell className="font-mono text-xs text-slate-600">
                              {row.code}
                            </TableCell>
                            <TableCell className="font-medium">
                              {row.nameAr}
                              {row.nameEn ?
                                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                  {row.nameEn}
                                </span>
                              : null}
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {Number.parseFloat(row.priceNormal).toFixed(3)}
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {Number.parseFloat(row.priceUrgent).toFixed(3)}
                            </TableCell>
                            <TableCell className="text-end tabular-nums text-slate-700">
                              {row.pricePressOnly != null ?
                                Number.parseFloat(row.pricePressOnly).toFixed(3)
                              : '—'}
                            </TableCell>
                            <TableCell className="text-end tabular-nums text-slate-700">
                              {row.priceUrgentPress != null ?
                                Number.parseFloat(row.priceUrgentPress).toFixed(3)
                              : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
