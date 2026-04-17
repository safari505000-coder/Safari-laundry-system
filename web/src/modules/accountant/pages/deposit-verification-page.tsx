import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BankDepositLogEntry,
  getBankDeposits,
  verifyBankDeposit,
  ApiError,
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
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';

export function DepositVerificationPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole, user } = useAuth();
  const canUse = hasMasterIslandAccess(user) || hasRole('ACCOUNTANT');
  const [rows, setRows] = useState<BankDepositLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    setLoading(true);
    try {
      const res = await getBankDeposits(token, { take: 300 });
      setRows(res.entries);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingRows = useMemo(
    () => rows.filter((r) => !r.verifiedAt),
    [rows],
  );

  const onVerify = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      await verifyBankDeposit(token, id);
      toast.success(t('verification.verifySuccess'));
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('verification.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('verification.subtitle')}</p>
      </header>

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('verification.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('verification.colDate')}</TableHead>
                <TableHead>{t('verification.colManager')}</TableHead>
                <TableHead className="text-end">{t('verification.colAmount')}</TableHead>
                <TableHead>{t('verification.colReceipt')}</TableHead>
                <TableHead className="w-[120px]">{t('verification.colAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ?
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">…</TableCell>
                </TableRow>
              : pendingRows.length === 0 ?
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('verification.empty')}
                  </TableCell>
                </TableRow>
              : pendingRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString(dateLocale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell>
                      {row.uploadedBy.fullName} (@{row.uploadedBy.username})
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(row.amountKd)}
                    </TableCell>
                    <TableCell>
                      <a
                        href={row.receiptImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('verification.openSlip')}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => void onVerify(row.id)}
                        disabled={busyId === row.id}
                      >
                        {busyId === row.id ?
                          <>
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            {t('verification.verifying')}
                          </>
                        : t('verification.verify')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
