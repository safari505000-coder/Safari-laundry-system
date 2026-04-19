import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  type ExpenseRow,
  ApiError,
  getPendingExpenseApprovals,
  updateExpenseStatus,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

export function ExpenseApprovalPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const dateLocale = useAppLocale();
  const canUse = can(user, 'expenseApproval.view');
  // ACCOUNTANT-only mutation: OWNER/GM oversee the queue but may not
  // approve/reject/audit expenses themselves (Dustur §4.2).
  const canAct = can(user, 'expenseApproval.act');
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    setLoading(true);
    try {
      const data = await getPendingExpenseApprovals(token);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  // Backend already returns `orderBy: { expenseDate: 'desc' }`; we re-sort
  // client-side as a safety net so the view is always latest-first even if a
  // legacy cached payload slips in.
  const orderedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
      ),
    [rows],
  );

  const setStatus = async (
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'AUDIT',
  ) => {
    if (!token) return;
    setBusyId(id);
    try {
      await updateExpenseStatus(token, id, status);
      toast.success(
        t('expenseApproval.statusMoved', {
          status: t(`expenseApproval.status.${status}`),
        }),
      );
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!canUse) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('nav.expenseVerification')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('expenseApproval.subtitle')}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('expenseApproval.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">
                    {t('expenseApproval.colDate')}
                  </TableHead>
                  <TableHead>{t('expenseApproval.colType')}</TableHead>
                  <TableHead className="text-end tabular-nums">
                    {t('expenseApproval.colValue')}
                  </TableHead>
                  <TableHead>{t('expenseApproval.colReceipt')}</TableHead>
                  <TableHead className="w-[360px]">
                    {t('expenseApproval.colAction')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : orderedRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t('expenseApproval.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  orderedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {new Date(row.expenseDate).toLocaleDateString(
                          dateLocale,
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="safari-table-primary">
                          {t(`expenseApproval.category.${row.category}`, {
                            defaultValue: row.category,
                          })}
                        </div>
                        {row.branch?.name ? (
                          <div className="text-xs text-muted-foreground">
                            {row.branch.name}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-semibold">
                        {formatKwdLabel(row.amount)}
                      </TableCell>
                      <TableCell>
                        {row.receiptUrl ? (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t('expenseApproval.viewReceipt')}
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
                              onClick={() => void setStatus(row.id, 'APPROVED')}
                            >
                              {t('expenseApproval.approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === row.id}
                              onClick={() => void setStatus(row.id, 'REJECTED')}
                            >
                              {t('expenseApproval.reject')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyId === row.id}
                              onClick={() => void setStatus(row.id, 'AUDIT')}
                            >
                              {t('expenseApproval.transferAudit')}
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
    </div>
  );
}
