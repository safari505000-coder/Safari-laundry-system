import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  ApiError,
  apiJson,
  updateLaundryPriceItem,
  type BranchRow,
  type LaundryPriceListItemRow,
  type UpdateLaundryPriceItemPayload,
} from '@/lib/api';
import { usePriceList } from '@/modules/shared/hooks/use-price-list';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
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

type EditDraft = {
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly: string;
  priceUrgentPress: string;
};

function toDraft(row: LaundryPriceListItemRow): EditDraft {
  return {
    priceNormal: Number.parseFloat(row.priceNormal).toFixed(3),
    priceUrgent: Number.parseFloat(row.priceUrgent).toFixed(3),
    pricePressOnly:
      row.pricePressOnly != null
        ? Number.parseFloat(row.pricePressOnly).toFixed(3)
        : '',
    priceUrgentPress:
      row.priceUrgentPress != null
        ? Number.parseFloat(row.priceUrgentPress).toFixed(3)
        : '',
  };
}

/**
 * Parse a KD price field from draft text.
 * - Returns the number when valid (≥ 0, up to 4 decimals).
 * - Returns `null` if the draft is blank and `nullable` is true (nullable tier cleared).
 * - Returns `'invalid'` otherwise.
 */
function parsePrice(
  raw: string,
  opts: { nullable: boolean },
): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return opts.nullable ? null : 'invalid';
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  // Enforce the backend's 4-decimal precision contract up front.
  const parts = trimmed.split('.');
  if (parts.length > 1 && parts[1].length > 4) return 'invalid';
  return n;
}

/**
 * Owner-only catalog editor.
 * Editing is allowed on the master tariff only; a branch-override editor is a
 * future increment — when a branch is previewed, rows fall back to read-only.
 * A successful save bumps `priceListVersion` on the backend; every session's
 * `usePriceList` reloads from that signal, so Driver POS screens sync without
 * a manual refresh.
 */
export function ManageItems() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const { refresh: refreshStream } = useSafariStream();
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [previewBranchId, setPreviewBranchId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

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

  const editingEnabled = previewBranchId === null;

  function beginEdit(row: LaundryPriceListItemRow) {
    if (!editingEnabled || saving) return;
    setEditingId(row.id);
    setDraft(toDraft(row));
  }

  function cancelEdit() {
    if (saving) return;
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(row: LaundryPriceListItemRow) {
    if (!token || !draft) return;

    const pn = parsePrice(draft.priceNormal, { nullable: false });
    const pu = parsePrice(draft.priceUrgent, { nullable: false });
    const pp = parsePrice(draft.pricePressOnly, { nullable: true });
    const pup = parsePrice(draft.priceUrgentPress, { nullable: true });

    if (pn === 'invalid' || pu === 'invalid' || pp === 'invalid' || pup === 'invalid') {
      toast.error(t('manageItems.invalidPrice'));
      return;
    }

    const payload: UpdateLaundryPriceItemPayload = {};
    if (pn !== null && Number(row.priceNormal) !== pn) payload.priceNormal = pn;
    if (pu !== null && Number(row.priceUrgent) !== pu) payload.priceUrgent = pu;

    const currentPP = row.pricePressOnly != null ? Number(row.pricePressOnly) : null;
    if (pp !== currentPP) payload.pricePressOnly = pp;

    const currentPUP = row.priceUrgentPress != null ? Number(row.priceUrgentPress) : null;
    if (pup !== currentPUP) payload.priceUrgentPress = pup;

    if (Object.keys(payload).length === 0) {
      setEditingId(null);
      setDraft(null);
      return;
    }

    setSaving(true);
    try {
      await updateLaundryPriceItem(token, row.id, payload);
      toast.success(t('manageItems.saveSuccess'));
      setEditingId(null);
      setDraft(null);
      await priceList.reload();
      // Nudge the stream snapshot so Driver POS tabs pick up the new
      // priceListVersion on their next tick (without waiting for the 45s poll).
      void refreshStream();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('manageItems.saveFailed'));
    } finally {
      setSaving(false);
    }
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
              {!editingEnabled ?
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t('manageItems.branchPreviewReadOnly')}
                </p>
              : null}
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Label className="text-slate-700">
                {t('manageItems.branchLabel')}
              </Label>
              <Select
                value={previewBranchId ?? 'MASTER'}
                onValueChange={(v) => {
                  cancelEdit();
                  setPreviewBranchId(v === 'MASTER' ? null : v);
                }}
                disabled={priceList.loading || !branches || saving}
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
                          <TableHead className="w-[180px] text-end font-semibold text-slate-800">
                            {t('manageItems.colActions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sec.items.map((row) => {
                          const isEditing = editingId === row.id;
                          return (
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
                                {isEditing && draft ?
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.001"
                                    min="0"
                                    className="ms-auto h-8 w-24 text-end tabular-nums"
                                    value={draft.priceNormal}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        priceNormal: e.target.value,
                                      })
                                    }
                                    disabled={saving}
                                    aria-label={t('manageItems.colNormal')}
                                  />
                                : Number.parseFloat(row.priceNormal).toFixed(3)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums">
                                {isEditing && draft ?
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.001"
                                    min="0"
                                    className="ms-auto h-8 w-24 text-end tabular-nums"
                                    value={draft.priceUrgent}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        priceUrgent: e.target.value,
                                      })
                                    }
                                    disabled={saving}
                                    aria-label={t('manageItems.colUrgent')}
                                  />
                                : Number.parseFloat(row.priceUrgent).toFixed(3)}
                              </TableCell>
                              <TableCell className="text-end tabular-nums text-slate-700">
                                {isEditing && draft ?
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.001"
                                    min="0"
                                    placeholder="—"
                                    className="ms-auto h-8 w-24 text-end tabular-nums"
                                    value={draft.pricePressOnly}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        pricePressOnly: e.target.value,
                                      })
                                    }
                                    disabled={saving}
                                    aria-label={t('manageItems.colPress')}
                                  />
                                : row.pricePressOnly != null ?
                                  Number.parseFloat(row.pricePressOnly).toFixed(3)
                                : '—'}
                              </TableCell>
                              <TableCell className="text-end tabular-nums text-slate-700">
                                {isEditing && draft ?
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.001"
                                    min="0"
                                    placeholder="—"
                                    className="ms-auto h-8 w-24 text-end tabular-nums"
                                    value={draft.priceUrgentPress}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        priceUrgentPress: e.target.value,
                                      })
                                    }
                                    disabled={saving}
                                    aria-label={t('manageItems.colUrgentPress')}
                                  />
                                : row.priceUrgentPress != null ?
                                  Number.parseFloat(row.priceUrgentPress).toFixed(3)
                                : '—'}
                              </TableCell>
                              <TableCell className="text-end">
                                {isEditing ?
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={cancelEdit}
                                      disabled={saving}
                                    >
                                      <X className="me-1 h-4 w-4" />
                                      {t('manageItems.cancel')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => void saveEdit(row)}
                                      disabled={saving}
                                    >
                                      {saving ?
                                        <Loader2 className="me-1 h-4 w-4 animate-spin" />
                                      : <Save className="me-1 h-4 w-4" />}
                                      {t('manageItems.save')}
                                    </Button>
                                  </div>
                                : <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => beginEdit(row)}
                                    disabled={!editingEnabled || saving}
                                    title={
                                      editingEnabled
                                        ? undefined
                                        : t('manageItems.branchPreviewReadOnly')
                                    }
                                  >
                                    <Pencil className="me-1 h-4 w-4" />
                                    {t('manageItems.edit')}
                                  </Button>
                                }
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
