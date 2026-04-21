import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  getPendingVehicleExpenseApprovals,
  updateVehicleExpenseStatus,
  type VehicleExpenseRow,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
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
import { Label } from '@/modules/shared/components/ui/label';
import { Textarea } from '@/modules/shared/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

export function VehicleExpensesApprovalPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const dateLocale = useAppLocale();
  const canView = can(user, 'vehicleExpenses.approval.view');
  const canAct = can(user, 'vehicleExpenses.approval.act');

  const [rows, setRows] = useState<VehicleExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<VehicleExpenseRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const data = await getPendingVehicleExpenseApprovals(token);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error(t('vehicleExpenses.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, canView, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const ordered = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
      ),
    [rows],
  );

  async function approve(row: VehicleExpenseRow) {
    if (!token) return;
    setBusyId(row.id);
    try {
      await updateVehicleExpenseStatus(token, row.id, { status: 'APPROVED' });
      toast.success(t('vehicleExpenses.approveSuccess'));
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget || !token) return;
    if (!rejectReason.trim()) {
      toast.error(t('vehicleExpenses.rejectReasonRequired'));
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await updateVehicleExpenseStatus(token, rejectTarget.id, {
        status: 'REJECTED',
        rejectionReason: rejectReason.trim(),
      });
      toast.success(t('vehicleExpenses.rejectSuccess'));
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {t('vehicleExpenses.approvalTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('vehicleExpenses.approvalSubtitle')}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('vehicleExpenses.approvalTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicleExpenses.colDate')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colVehicle')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colType')}</TableHead>
                  <TableHead className="text-end tabular-nums">
                    {t('vehicleExpenses.colAmount')}
                  </TableHead>
                  <TableHead>{t('vehicleExpenses.colVendor')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colSubmittedBy')}</TableHead>
                  <TableHead>{t('vehicleExpenses.colReceipt')}</TableHead>
                  <TableHead className="w-[240px]">
                    {t('vehicleExpenses.colAction')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : ordered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t('vehicleExpenses.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  ordered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {new Date(row.expenseDate).toLocaleDateString(
                          dateLocale,
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{row.vehiclePlate}</div>
                        {row.vehicleLabel ? (
                          <div className="text-xs text-muted-foreground">
                            {row.vehicleLabel}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {t(`vehicleExpenses.typeLabel.${row.expenseType}`)}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {formatKwdLabel(row.amount)}
                      </TableCell>
                      <TableCell>{row.vendorName ?? '—'}</TableCell>
                      <TableCell>
                        <div>{row.submittedBy.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          @{row.submittedBy.username}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.receiptUrl ? (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('vehicleExpenses.viewReceipt')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {canAct ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="success"
                              disabled={busyId === row.id}
                              onClick={() => void approve(row)}
                            >
                              {t('vehicleExpenses.approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === row.id}
                              onClick={() => {
                                setRejectTarget(row);
                                setRejectReason('');
                              }}
                            >
                              {t('vehicleExpenses.reject')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('vehicleExpenses.rejectConfirmTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('vehicleExpenses.rejectConfirmBody')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              {t('vehicleExpenses.rejectReasonLabel')}
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
            >
              {t('vehicleExpenses.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmReject()}
              disabled={busyId === rejectTarget?.id}
            >
              {busyId === rejectTarget?.id ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('vehicleExpenses.confirmReject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
