import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type ExpenseRow,
  ApiError,
  getPendingExpenseApprovals,
  updateExpenseStatus,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
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
  const { t, i18n } = useTranslation();
  const { token, hasRole } = useAuth();
  const rtl = i18n.dir() === 'rtl';
  const canUse = hasRole('ACCOUNTANT', 'OWNER') ?? false;
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
    <div className="space-y-6" dir={rtl ? 'rtl' : 'ltr'}>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ط§ظ„ظپط±ط¹</TableHead>
                <TableHead>ط§ظ„ظپط¦ط©</TableHead>
                <TableHead className={rtl ? 'text-start' : 'text-end'}>
                  ط§ظ„ظ…ط¨ظ„ط؛
                </TableHead>
                <TableHead>ط§ظ„ط¥ظٹطµط§ظ„</TableHead>
                <TableHead className="w-[360px]">ط§ظ„ط¥ط¬ط±ط§ط،ط§طھ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {t('expenseApproval.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.branch?.name ?? 'â€”'}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className={rtl ? 'text-start' : 'text-end'}>
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
                        'â€”'
                      )}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

