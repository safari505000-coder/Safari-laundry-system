import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileSignature,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  ApiError,
  cancelDebtTransfer,
  createDebtTransfer,
  finalizeDebtTransfer,
  getDebtTransfer,
  getDriverOutstandingOrders,
  listDebtTransferDrivers,
  listDebtTransfers,
  signDebtTransferSource,
  signDebtTransferTarget,
  type DebtTransferListFilters,
  type DebtTransferRow,
  type DebtTransferStatus,
  type DriverOutstanding,
  type SafariRole,
} from '@/lib/api';
import { can } from '@/modules/shared/auth/access-matrix';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Checkbox } from '@/modules/shared/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { Input } from '@/modules/shared/components/ui/input';
import { Label } from '@/modules/shared/components/ui/label';
import { ScrollArea } from '@/modules/shared/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import { Textarea } from '@/modules/shared/components/ui/textarea';

type DriverOption = {
  id: string;
  fullName: string;
  username: string;
  safariRole: SafariRole;
  isActive?: boolean;
};

function statusTone(status: DebtTransferStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'AWAITING_SIGNATURES':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'CANCELLED':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

export function DebtTransfersPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();

  const canCreate = can(user, 'debtTransfer.create');
  const canFinalize = can(user, 'debtTransfer.finalize');
  const canCancel = can(user, 'debtTransfer.cancel');

  const [rows, setRows] = useState<DebtTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DebtTransferListFilters>({
    limit: 50,
    offset: 0,
  });
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebtTransferRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listDebtTransfers(token, filters);
      setRows(res.rows);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Drivers list for filters & picker (only for roles who can see the page).
  useEffect(() => {
    if (!token) return;
    listDebtTransferDrivers(token)
      .then((data) => setDrivers(data.drivers ?? []))
      .catch(() => {
        /* non-fatal */
      });
  }, [token]);

  const openDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      setActiveId(id);
      setDetailLoading(true);
      try {
        const row = await getDebtTransfer(token, id);
        setDetail(row);
      } catch (err) {
        toast.error((err as Error).message);
        setActiveId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token],
  );

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('debtTransfers.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('debtTransfers.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            {t('debtTransfers.refresh')}
          </Button>
          {canCreate ? (
            <Button onClick={() => setOpenCreate(true)}>
              <Plus className="me-2 h-4 w-4" />
              {t('debtTransfers.newTransfer')}
            </Button>
          ) : null}
        </div>
      </header>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('debtTransfers.filters.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Select
            value={filters.status ?? 'ALL'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status:
                  v === 'ALL' ? undefined : (v as DebtTransferStatus),
                offset: 0,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('debtTransfers.filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('debtTransfers.filters.all')}</SelectItem>
              <SelectItem value="DRAFT">
                {t('debtTransfers.status.DRAFT')}
              </SelectItem>
              <SelectItem value="AWAITING_SIGNATURES">
                {t('debtTransfers.status.AWAITING_SIGNATURES')}
              </SelectItem>
              <SelectItem value="COMPLETED">
                {t('debtTransfers.status.COMPLETED')}
              </SelectItem>
              <SelectItem value="CANCELLED">
                {t('debtTransfers.status.CANCELLED')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sourceDriverId ?? 'ALL'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                sourceDriverId: v === 'ALL' ? undefined : v,
                offset: 0,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('debtTransfers.filters.sourceDriver')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                {t('debtTransfers.filters.all')}
              </SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName} ({d.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.targetDriverId ?? 'ALL'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                targetDriverId: v === 'ALL' ? undefined : v,
                offset: 0,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('debtTransfers.filters.targetDriver')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">
                {t('debtTransfers.filters.all')}
              </SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName} ({d.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                from: e.target.value || undefined,
                offset: 0,
              }))
            }
            placeholder={t('debtTransfers.filters.from')}
          />
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                to: e.target.value || undefined,
                offset: 0,
              }))
            }
            placeholder={t('debtTransfers.filters.to')}
          />
          <Button
            variant="outline"
            onClick={() =>
              setFilters({ limit: filters.limit ?? 50, offset: 0 })
            }
          >
            {t('debtTransfers.filters.clear')}
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t('debtTransfers.table.date')}</th>
                  <th className="p-3 text-start">{t('debtTransfers.table.source')}</th>
                  <th className="p-3 text-start">{t('debtTransfers.table.target')}</th>
                  <th className="p-3 text-end">{t('debtTransfers.table.amount')}</th>
                  <th className="p-3 text-end">{t('debtTransfers.table.orders')}</th>
                  <th className="p-3 text-start">{t('debtTransfers.table.status')}</th>
                  <th className="p-3 text-start">{t('debtTransfers.table.executedBy')}</th>
                  <th className="p-3 text-end">{t('debtTransfers.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {t('debtTransfers.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="p-3">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">{r.sourceDriver.fullName}</td>
                      <td className="p-3">{r.targetDriver.fullName}</td>
                      <td className="p-3 text-end font-mono">{r.totalAmount}</td>
                      <td className="p-3 text-end">{r.orderCount}</td>
                      <td className="p-3">
                        <Badge className={statusTone(r.status)}>
                          {t(`debtTransfers.status.${r.status}`)}
                        </Badge>
                      </td>
                      <td className="p-3">{r.executedBy.fullName}</td>
                      <td className="p-3 text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void openDetail(r.id)}
                        >
                          {t('debtTransfers.viewDetails')}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      {canCreate ? (
        <CreateDebtTransferDialog
          open={openCreate}
          onOpenChange={setOpenCreate}
          drivers={drivers}
          onCreated={() => {
            setOpenCreate(false);
            void load();
          }}
        />
      ) : null}

      {/* Detail dialog */}
      <Dialog
        open={activeId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setActiveId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <DebtTransferDetail
              row={detail}
              canFinalize={canFinalize}
              canCancel={canCancel}
              inFlight={actionInFlight}
              currentUserId={user.id}
              onClose={() => {
                setActiveId(null);
                setDetail(null);
              }}
              onMutated={async () => {
                const fresh = await getDebtTransfer(token!, detail.id);
                setDetail(fresh);
                void load();
              }}
              setInFlight={setActionInFlight}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Create dialog ─────────────────────────────────────────────────────── */

function CreateDebtTransferDialog({
  open,
  onOpenChange,
  drivers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  drivers: DriverOption[];
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [sourceId, setSourceId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [outstanding, setOutstanding] = useState<DriverOutstanding | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSourceId('');
      setTargetId('');
      setReason('');
      setNotes('');
      setOutstanding(null);
      setSelectedOrders(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!token || !sourceId) {
      setOutstanding(null);
      setSelectedOrders(new Set());
      return;
    }
    getDriverOutstandingOrders(token, sourceId)
      .then((data) => {
        setOutstanding(data);
        setSelectedOrders(new Set(data.orders.map((o) => o.id)));
      })
      .catch((err) => {
        toast.error((err as Error).message);
        setOutstanding(null);
      });
  }, [token, sourceId]);

  const totalSelected = useMemo(() => {
    if (!outstanding) return '0.000';
    const sum = outstanding.orders.reduce((acc, o) => {
      if (!selectedOrders.has(o.id)) return acc;
      return acc + Number.parseFloat(o.totalPrice);
    }, 0);
    return sum.toFixed(3);
  }, [outstanding, selectedOrders]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!sourceId || !targetId) return;
    if (sourceId === targetId) {
      toast.error(t('debtTransfers.create.failed'));
      return;
    }
    if (selectedOrders.size === 0) return;
    setSubmitting(true);
    try {
      await createDebtTransfer(token, {
        sourceDriverId: sourceId,
        targetDriverId: targetId,
        orderIds: Array.from(selectedOrders),
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(t('debtTransfers.create.success'));
      onCreated();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : t('debtTransfers.create.failed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('debtTransfers.create.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{t('debtTransfers.create.sourceDriver')}</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      'debtTransfers.create.sourceDriverPlaceholder',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName} ({d.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('debtTransfers.create.targetDriver')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      'debtTransfers.create.targetDriverPlaceholder',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter((d) => d.id !== sourceId)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.fullName} ({d.username})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('debtTransfers.create.outstanding')}</Label>
            {!sourceId ? (
              <p className="text-sm text-muted-foreground">
                {t('debtTransfers.create.sourceDriverPlaceholder')}
              </p>
            ) : !outstanding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : outstanding.orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('debtTransfers.create.noOutstanding')}
              </p>
            ) : (
              <ScrollArea className="h-60 rounded border">
                <ul className="divide-y">
                  {outstanding.orders.map((o) => {
                    const checked = selectedOrders.has(o.id);
                    return (
                      <li
                        key={o.id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <label className="flex flex-1 items-center gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedOrders);
                              if (v) next.add(o.id);
                              else next.delete(o.id);
                              setSelectedOrders(next);
                            }}
                          />
                          <span className="font-mono">
                            {o.invoiceNumber ?? o.serialNumber ?? o.id.slice(0, 8)}
                          </span>
                          <span className="text-muted-foreground">
                            {o.customer.displayName ?? o.customer.phone}
                          </span>
                        </label>
                        <span className="font-mono">{o.totalPrice}</span>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
            {outstanding && outstanding.orders.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('debtTransfers.create.selectedCount', {
                  count: selectedOrders.size,
                  total: totalSelected,
                })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dt-reason">{t('debtTransfers.create.reason')}</Label>
            <Input
              id="dt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('debtTransfers.create.reasonPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dt-notes">{t('debtTransfers.create.notes')}</Label>
            <Textarea
              id="dt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('debtTransfers.create.notesPlaceholder')}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('debtTransfers.create.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !sourceId ||
                !targetId ||
                selectedOrders.size === 0
              }
            >
              {submitting ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('debtTransfers.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Detail body ───────────────────────────────────────────────────────── */

function DebtTransferDetail({
  row,
  canFinalize,
  canCancel,
  inFlight,
  currentUserId,
  onClose,
  onMutated,
  setInFlight,
}: {
  row: DebtTransferRow;
  canFinalize: boolean;
  canCancel: boolean;
  inFlight: boolean;
  currentUserId: string;
  onClose: () => void;
  onMutated: () => Promise<void> | void;
  setInFlight: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { token } = useAuth();

  const isSource = row.sourceDriver.id === currentUserId;
  const isTarget = row.targetDriver.id === currentUserId;
  const awaitingSig = row.status === 'AWAITING_SIGNATURES';
  const canSignSource = awaitingSig && isSource && !row.sourceSignedAt;
  const canSignTarget = awaitingSig && isTarget && !row.targetSignedAt;
  const canFinalizeNow =
    awaitingSig &&
    canFinalize &&
    row.sourceSignedAt !== null &&
    row.targetSignedAt !== null;
  const canCancelNow =
    canCancel &&
    (row.status === 'DRAFT' || row.status === 'AWAITING_SIGNATURES');

  const runAction = async (fn: () => Promise<unknown>, okKey: string) => {
    if (!token) return;
    setInFlight(true);
    try {
      await fn();
      toast.success(t(okKey));
      await onMutated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInFlight(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="truncate">
            {t('debtTransfers.detail.title', { id: row.id.slice(0, 8) })}
          </span>
          <Badge className={statusTone(row.status)}>
            {t(`debtTransfers.status.${row.status}`)}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <KV label={t('debtTransfers.detail.amount')} value={`${row.totalAmount} KD`} mono />
        <KV label={t('debtTransfers.detail.orderCount')} value={String(row.orderCount)} />
        <KV label={t('debtTransfers.detail.sourceDriver')} value={row.sourceDriver.fullName} />
        <KV label={t('debtTransfers.detail.targetDriver')} value={row.targetDriver.fullName} />
        <KV
          label={t('debtTransfers.detail.executedBy')}
          value={`${row.executedBy.fullName} (${row.executedByRole})`}
        />
        <KV
          label={t('debtTransfers.detail.created')}
          value={new Date(row.createdAt).toLocaleString()}
        />
        {row.reason ? (
          <KV label={t('debtTransfers.detail.reason')} value={row.reason} />
        ) : null}
        {row.notes ? (
          <KV label={t('debtTransfers.detail.notes')} value={row.notes} />
        ) : null}
        {row.finalizedAt ? (
          <KV
            label={t('debtTransfers.detail.finalized')}
            value={new Date(row.finalizedAt).toLocaleString()}
          />
        ) : null}
        {row.cancelledAt ? (
          <KV
            label={t('debtTransfers.detail.cancelled')}
            value={`${new Date(row.cancelledAt).toLocaleString()}${
              row.cancelledReason ? ` — ${row.cancelledReason}` : ''
            }`}
          />
        ) : null}
        {row.systemSignature ? (
          <KV
            label={t('debtTransfers.detail.systemSignature')}
            value={row.systemSignature}
            mono
          />
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium uppercase text-muted-foreground">
          {t('debtTransfers.detail.signatures')}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SignatureCard
            label={t('debtTransfers.detail.sourceSignedAt')}
            signedAt={row.sourceSignedAt}
            pendingLabel={t('debtTransfers.detail.pendingSignature')}
          />
          <SignatureCard
            label={t('debtTransfers.detail.targetSignedAt')}
            signedAt={row.targetSignedAt}
            pendingLabel={t('debtTransfers.detail.pendingSignature')}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium uppercase text-muted-foreground">
          {t('debtTransfers.detail.orders')}
        </h3>
        <div className="rounded border">
          <table className="w-full text-sm">
            <tbody>
              {row.orders.map((line) => (
                <tr key={line.id} className="border-t first:border-t-0">
                  <td className="p-2 font-mono">
                    {line.order.invoiceNumber ??
                      line.order.serialNumber ??
                      line.order.id.slice(0, 8)}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {line.order.customer.displayName ??
                      line.order.customer.phone}
                  </td>
                  <td className="p-2 text-end font-mono">
                    {line.amountSnapshot}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('debtTransfers.detail.back')}
        </Button>
        {canSignSource ? (
          <Button
            disabled={inFlight}
            onClick={() =>
              void runAction(
                () => signDebtTransferSource(token!, row.id),
                'debtTransfers.detail.signed',
              )
            }
          >
            <FileSignature className="me-2 h-4 w-4" />
            {t('debtTransfers.detail.signAsSource')}
          </Button>
        ) : null}
        {canSignTarget ? (
          <Button
            disabled={inFlight}
            onClick={() =>
              void runAction(
                () => signDebtTransferTarget(token!, row.id),
                'debtTransfers.detail.signed',
              )
            }
          >
            <FileSignature className="me-2 h-4 w-4" />
            {t('debtTransfers.detail.signAsTarget')}
          </Button>
        ) : null}
        {canFinalizeNow ? (
          <Button
            disabled={inFlight}
            onClick={() => {
              if (!window.confirm(t('debtTransfers.detail.finalizeConfirm')))
                return;
              void runAction(
                () => finalizeDebtTransfer(token!, row.id),
                'debtTransfers.detail.finalized_ok',
              );
            }}
          >
            <CheckCircle2 className="me-2 h-4 w-4" />
            {t('debtTransfers.detail.finalize')}
          </Button>
        ) : null}
        {canCancelNow ? (
          <Button
            variant="destructive"
            disabled={inFlight}
            onClick={() => {
              const reason = window.prompt(t('debtTransfers.detail.cancelPrompt'));
              if (reason === null) return;
              void runAction(
                () => cancelDebtTransfer(token!, row.id, reason),
                'debtTransfers.detail.cancelled_ok',
              );
            }}
          >
            <Ban className="me-2 h-4 w-4" />
            {t('debtTransfers.detail.cancelTransfer')}
          </Button>
        ) : null}
      </DialogFooter>
    </div>
  );
}

function KV({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border/50 bg-muted/10 p-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</span>
    </div>
  );
}

function SignatureCard({
  label,
  signedAt,
  pendingLabel,
}: {
  label: string;
  signedAt: string | null;
  pendingLabel: string;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        signedAt
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}
    >
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">
        {signedAt ? new Date(signedAt).toLocaleString() : pendingLabel}
      </div>
    </div>
  );
}
