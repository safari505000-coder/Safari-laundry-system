import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileSignature, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  getDebtTransfer,
  listMyDebtTransfers,
  signDebtTransferSource,
  signDebtTransferTarget,
  type DebtTransferRow,
  type DebtTransferStatus,
} from '@/lib/api';
import { Badge } from '@/modules/shared/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';

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

/**
 * Driver-facing inbox of debt transfers where the driver is either the
 * source (releasing cash custody) or the target (accepting it). The
 * driver can only see their own documents and may sign exactly their
 * half. Finalization / cancellation stay with GM + ACCOUNTANT.
 */
export function MyDebtTransfersPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [rows, setRows] = useState<DebtTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<DebtTransferRow | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listMyDebtTransfers(token);
      setRows(data.rows);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return null;

  const refreshActive = async (id: string) => {
    if (!token) return;
    try {
      const fresh = await getDebtTransfer(token, id);
      setActive(fresh);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const sign = async (row: DebtTransferRow, role: 'source' | 'target') => {
    if (!token) return;
    setInFlight(true);
    try {
      const fn =
        role === 'source' ? signDebtTransferSource : signDebtTransferTarget;
      const fresh = await fn(token, row.id);
      toast.success(t('debtTransfers.detail.signed'));
      setActive(fresh);
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInFlight(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t('debtTransfers.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('debtTransfers.subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="me-2 h-4 w-4" />
          {t('debtTransfers.refresh')}
        </Button>
      </header>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t('debtTransfers.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const isSource = r.sourceDriver.id === user.id;
            const isTarget = r.targetDriver.id === user.id;
            const needsSourceSig =
              isSource &&
              r.status === 'AWAITING_SIGNATURES' &&
              !r.sourceSignedAt;
            const needsTargetSig =
              isTarget &&
              r.status === 'AWAITING_SIGNATURES' &&
              !r.targetSignedAt;
            return (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <span>
                      {r.sourceDriver.fullName}
                      {' → '}
                      {r.targetDriver.fullName}
                    </span>
                    <Badge className={statusTone(r.status)}>
                      {t(`debtTransfers.status.${r.status}`)}
                    </Badge>
                  </CardTitle>
                  <span className="font-mono text-sm">{r.totalAmount} KD</span>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <div>
                    {new Date(r.createdAt).toLocaleString()} ·{' '}
                    {r.orderCount} {t('debtTransfers.table.orders')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActive(r)}
                    >
                      {t('debtTransfers.viewDetails')}
                    </Button>
                    {needsSourceSig ? (
                      <Button
                        size="sm"
                        disabled={inFlight}
                        onClick={() => void sign(r, 'source')}
                      >
                        <FileSignature className="me-2 h-4 w-4" />
                        {t('debtTransfers.detail.signAsSource')}
                      </Button>
                    ) : null}
                    {needsTargetSig ? (
                      <Button
                        size="sm"
                        disabled={inFlight}
                        onClick={() => void sign(r, 'target')}
                      >
                        <FileSignature className="me-2 h-4 w-4" />
                        {t('debtTransfers.detail.signAsTarget')}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail sheet */}
      <Dialog
        open={active !== null}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          {active ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {t('debtTransfers.detail.title', { id: active.id.slice(0, 8) })}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">
                  {t('debtTransfers.detail.sourceDriver')}
                </div>
                <div>{active.sourceDriver.fullName}</div>
                <div className="text-muted-foreground">
                  {t('debtTransfers.detail.targetDriver')}
                </div>
                <div>{active.targetDriver.fullName}</div>
                <div className="text-muted-foreground">
                  {t('debtTransfers.detail.amount')}
                </div>
                <div className="font-mono">{active.totalAmount} KD</div>
                <div className="text-muted-foreground">
                  {t('debtTransfers.detail.orderCount')}
                </div>
                <div>{active.orderCount}</div>
                {active.reason ? (
                  <>
                    <div className="text-muted-foreground">
                      {t('debtTransfers.detail.reason')}
                    </div>
                    <div>{active.reason}</div>
                  </>
                ) : null}
              </div>
              <div className="rounded border">
                <table className="w-full text-sm">
                  <tbody>
                    {active.orders.map((line) => (
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActive(null)}>
                  {t('debtTransfers.detail.back')}
                </Button>
                {active.sourceDriver.id === user.id &&
                active.status === 'AWAITING_SIGNATURES' &&
                !active.sourceSignedAt ? (
                  <Button
                    disabled={inFlight}
                    onClick={() =>
                      void sign(active, 'source').then(() =>
                        refreshActive(active.id),
                      )
                    }
                  >
                    <FileSignature className="me-2 h-4 w-4" />
                    {t('debtTransfers.detail.signAsSource')}
                  </Button>
                ) : null}
                {active.targetDriver.id === user.id &&
                active.status === 'AWAITING_SIGNATURES' &&
                !active.targetSignedAt ? (
                  <Button
                    disabled={inFlight}
                    onClick={() =>
                      void sign(active, 'target').then(() =>
                        refreshActive(active.id),
                      )
                    }
                  >
                    <FileSignature className="me-2 h-4 w-4" />
                    {t('debtTransfers.detail.signAsTarget')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
