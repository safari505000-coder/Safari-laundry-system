import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useSafariStream } from '@/contexts/safari-stream-context';
import {
  ApiError,
  apiJson,
  createLaundryPriceItem,
  deleteLaundryPriceItem,
  updateLaundryPriceItem,
  type BranchRow,
  type CreateLaundryPriceItemPayload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Switch } from '@/modules/shared/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

type EditDraft = {
  nameAr: string;
  nameEn: string;
  priceNormal: string;
  priceUrgent: string;
  pricePressOnly: string;
  priceUrgentPress: string;
};

function toDraft(row: LaundryPriceListItemRow): EditDraft {
  return {
    nameAr: row.nameAr,
    nameEn: row.nameEn ?? '',
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

type CreateDraft = {
  code: string;
  nameAr: string;
  nameEn: string;
  categoryId: string;
  priceNormal: string;
  priceUrgent: string;
};

const EMPTY_CREATE: CreateDraft = {
  code: '',
  nameAr: '',
  nameEn: '',
  categoryId: '',
  priceNormal: '0.000',
  priceUrgent: '0.000',
};

/**
 * Owner-only catalog editor.
 *
 * Capabilities (OWNER master key):
 *  • Create new tariff rows (price defaults to 0 — edit afterwards)
 *  • Rename items (Arabic / English) inline alongside price edits
 *  • Toggle `isActive` to hide a row from POS / Driver catalogs without
 *    touching historical orders (those snapshot price + label at write time)
 *  • Hard-delete rows when no `OrderLineItem.label` still references them
 *
 * Every successful write bumps `priceListVersion` on the backend; the
 * `usePriceList` hook subscribes to that signal via `useSafariStream`, so
 * driver POS devices reload their catalog on the next ≤45 s tick.
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

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
    // Owner management view — keep hidden rows visible so they can be
    // re-activated or deleted. POS / Driver callers leave this off.
    includeInactive: true,
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

    const nameAr = draft.nameAr.trim();
    if (nameAr.length === 0) {
      toast.error(t('manageItems.invalidName'));
      return;
    }
    const nameEnTrimmed = draft.nameEn.trim();

    const payload: UpdateLaundryPriceItemPayload = {};
    if (nameAr !== row.nameAr) payload.nameAr = nameAr;
    const currentEn = row.nameEn ?? '';
    if (nameEnTrimmed !== currentEn) {
      payload.nameEn = nameEnTrimmed.length === 0 ? null : nameEnTrimmed;
    }
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

  async function toggleActive(row: LaundryPriceListItemRow, nextActive: boolean) {
    // `isActive` is a global flag — intentionally NOT gated on branch preview
    // so the Owner can hide a garment system-wide from any branch view.
    if (!token) return;
    setTogglingId(row.id);
    try {
      await updateLaundryPriceItem(token, row.id, { isActive: nextActive });
      toast.success(
        nextActive
          ? t('manageItems.activateSuccess')
          : t('manageItems.hideSuccess'),
      );
      await priceList.reload();
      void refreshStream();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('manageItems.saveFailed'));
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete(row: LaundryPriceListItemRow) {
    if (!token) return;
    setSaving(true);
    try {
      await deleteLaundryPriceItem(token, row.id);
      toast.success(t('manageItems.deleteSuccess'));
      setConfirmDeleteId(null);
      if (editingId === row.id) {
        setEditingId(null);
        setDraft(null);
      }
      await priceList.reload();
      void refreshStream();
    } catch (e) {
      if (e instanceof ApiError) {
        // Backend guard message already explains the blocker; surface it and
        // guide the user toward the soft-hide path.
        toast.error(e.message);
      } else toast.error(t('manageItems.deleteFailed'));
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setCreateDraft(EMPTY_CREATE);
    setCreateOpen(true);
  }

  async function submitCreate() {
    if (!token) return;
    const code = createDraft.code.trim().toUpperCase();
    const nameAr = createDraft.nameAr.trim();
    const nameEn = createDraft.nameEn.trim();

    if (code.length < 2 || !/^[A-Z0-9][A-Z0-9_-]*$/u.test(code)) {
      toast.error(t('manageItems.createInvalidCode'));
      return;
    }
    if (nameAr.length === 0) {
      toast.error(t('manageItems.invalidName'));
      return;
    }
    const pn = parsePrice(createDraft.priceNormal, { nullable: false });
    const pu = parsePrice(createDraft.priceUrgent, { nullable: false });
    if (pn === 'invalid' || pu === 'invalid') {
      toast.error(t('manageItems.invalidPrice'));
      return;
    }

    const payload: CreateLaundryPriceItemPayload = {
      code,
      nameAr,
      nameEn: nameEn.length === 0 ? null : nameEn,
      categoryId:
        createDraft.categoryId && createDraft.categoryId !== 'NONE'
          ? createDraft.categoryId
          : null,
      priceNormal: pn ?? 0,
      priceUrgent: pu ?? 0,
    };

    setCreating(true);
    try {
      await createLaundryPriceItem(token, payload);
      toast.success(t('manageItems.createSuccess'));
      setCreateOpen(false);
      setCreateDraft(EMPTY_CREATE);
      await priceList.reload();
      void refreshStream();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('manageItems.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-[60vh] space-y-6 bg-slate-50/80 p-4 text-slate-900 md:p-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t('manageItems.title')}
          </h1>
          <p className="text-sm text-slate-600">{t('manageItems.subtitle')}</p>
        </div>
        {/*
          V5.0 — Add / Edit / Delete surfaces are the OWNER master-control
          surface and only apply to the **global master tariff**. We hide the
          button outright during any branch preview (not just disable it) so
          the Owner can't confuse per-branch overrides with global CRUD. The
          page is already role-gated at the top (OWNER-only Navigate guard),
          so no additional role check is required here.
        */}
        {editingEnabled ?
          <Button onClick={openCreate} disabled={saving}>
            <Plus className="me-1 h-4 w-4" />
            {t('manageItems.addItem')}
          </Button>
        : null}
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
                  {/*
                    Base UI's Select.Value falls back to the raw `value` string
                    unless an explicit render-prop maps it. Without this, the
                    trigger was flashing the branch UUID on first paint. We
                    resolve the id → `branch.name` here so the Owner always
                    sees a human label on the control.
                  */}
                  <SelectValue placeholder={t('manageItems.branchPlaceholder')}>
                    {(val: unknown) => {
                      const v = typeof val === 'string' ? val : 'MASTER';
                      if (v === 'MASTER') return t('manageItems.masterList');
                      const hit = branches?.find((b) => b.id === v);
                      return hit ? hit.name : t('manageItems.branchPlaceholder');
                    }}
                  </SelectValue>
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
                          <TableHead className="w-[120px] text-center font-semibold text-slate-800">
                            {t('manageItems.colStatus')}
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
                          <TableHead className="w-[220px] text-end font-semibold text-slate-800">
                            {t('manageItems.colActions')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sec.items.map((row) => {
                          const isEditing = editingId === row.id;
                          const rowDimmed = !row.isActive && !isEditing;
                          const isConfirmingDelete = confirmDeleteId === row.id;
                          return (
                            <TableRow
                              key={row.id}
                              className={
                                'border-slate-100 text-slate-800 ' +
                                (rowDimmed ? 'bg-slate-50 text-slate-500' : '')
                              }
                            >
                              <TableCell className="font-mono text-xs text-slate-600">
                                {row.code}
                              </TableCell>
                              <TableCell className="font-medium">
                                {isEditing && draft ?
                                  <div className="space-y-1.5">
                                    <Input
                                      value={draft.nameAr}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          nameAr: e.target.value,
                                        })
                                      }
                                      disabled={saving}
                                      className="h-8"
                                      placeholder={t('manageItems.namePlaceholderAr')}
                                      aria-label={t('manageItems.namePlaceholderAr')}
                                    />
                                    <Input
                                      value={draft.nameEn}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          nameEn: e.target.value,
                                        })
                                      }
                                      disabled={saving}
                                      className="h-8 text-xs"
                                      placeholder={t('manageItems.namePlaceholderEn')}
                                      aria-label={t('manageItems.namePlaceholderEn')}
                                    />
                                  </div>
                                : <>
                                    {row.nameAr}
                                    {row.nameEn ?
                                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                        {row.nameEn}
                                      </span>
                                    : null}
                                    {!row.isActive ?
                                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                                        <EyeOff className="h-3 w-3" />
                                        {t('manageItems.hiddenBadge')}
                                      </span>
                                    : null}
                                  </>
                                }
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {/*
                                    `isActive` is a GLOBAL hide/activate flag
                                    (not per-branch), so the toggle remains
                                    functional even while the Owner previews a
                                    branch. The branch-preview guard only
                                    gates per-branch mutations (master prices,
                                    rename, delete) — not this global switch.
                                  */}
                                  <Switch
                                    size="sm"
                                    checked={row.isActive}
                                    onCheckedChange={(v) =>
                                      void toggleActive(row, Boolean(v))
                                    }
                                    disabled={
                                      saving ||
                                      togglingId === row.id ||
                                      isEditing
                                    }
                                    aria-label={t('manageItems.colStatus')}
                                  />
                                  {togglingId === row.id ?
                                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                  : null}
                                </div>
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
                                : isConfirmingDelete ?
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setConfirmDeleteId(null)}
                                      disabled={saving}
                                    >
                                      {t('manageItems.cancel')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => void confirmDelete(row)}
                                      disabled={saving}
                                    >
                                      {saving ?
                                        <Loader2 className="me-1 h-4 w-4 animate-spin" />
                                      : <Trash2 className="me-1 h-4 w-4" />}
                                      {t('manageItems.confirmDelete')}
                                    </Button>
                                  </div>
                                : editingEnabled ?
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => beginEdit(row)}
                                      disabled={saving}
                                    >
                                      <Pencil className="me-1 h-4 w-4" />
                                      {t('manageItems.edit')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setConfirmDeleteId(row.id)}
                                      disabled={saving}
                                      title={t('manageItems.deleteHint')}
                                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                : <span className="text-[11px] italic text-slate-400">
                                    {t('manageItems.readOnlyShort')}
                                  </span>
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

      <Dialog open={createOpen} onOpenChange={(v) => !creating && setCreateOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('manageItems.createTitle')}</DialogTitle>
            <DialogDescription>
              {t('manageItems.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t('manageItems.colCode')}</Label>
              <Input
                value={createDraft.code}
                onChange={(e) =>
                  setCreateDraft({
                    ...createDraft,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="ABA-001"
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('manageItems.namePlaceholderAr')}</Label>
              <Input
                value={createDraft.nameAr}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, nameAr: e.target.value })
                }
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('manageItems.namePlaceholderEn')}</Label>
              <Input
                value={createDraft.nameEn}
                onChange={(e) =>
                  setCreateDraft({ ...createDraft, nameEn: e.target.value })
                }
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('manageItems.categoryLabel')}</Label>
              <Select
                value={createDraft.categoryId || 'NONE'}
                onValueChange={(v) =>
                  setCreateDraft({
                    ...createDraft,
                    categoryId: !v || v === 'NONE' ? '' : v,
                  })
                }
                disabled={creating}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('manageItems.categoryPlaceholder')}>
                    {(val: unknown) => {
                      const v = typeof val === 'string' ? val : 'NONE';
                      if (v === 'NONE' || v === '') {
                        return t('manageItems.uncategorized');
                      }
                      const hit = priceList.categories.find(
                        (c) => c.id === v,
                      );
                      return hit ? hit.nameAr : t('manageItems.categoryPlaceholder');
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">
                    {t('manageItems.uncategorized')}
                  </SelectItem>
                  {priceList.categories
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nameAr}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('manageItems.colNormal')}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={createDraft.priceNormal}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      priceNormal: e.target.value,
                    })
                  }
                  disabled={creating}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('manageItems.colUrgent')}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={createDraft.priceUrgent}
                  onChange={(e) =>
                    setCreateDraft({
                      ...createDraft,
                      priceUrgent: e.target.value,
                    })
                  }
                  disabled={creating}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t('manageItems.cancel')}
            </Button>
            <Button onClick={() => void submitCreate()} disabled={creating}>
              {creating ?
                <Loader2 className="me-1 h-4 w-4 animate-spin" />
              : <Plus className="me-1 h-4 w-4" />}
              {t('manageItems.createSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
