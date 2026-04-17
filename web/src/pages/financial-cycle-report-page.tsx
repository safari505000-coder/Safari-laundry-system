import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type FinancialCycleRow,
  getFinancialCycleReport,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
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

export function FinancialCycleReportPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole } = useAuth();
  const canUse = hasRole('OWNER') ?? false;
  const [rows, setRows] = useState<FinancialCycleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !canUse) return;
    setLoading(true);
    try {
      const res = await getFinancialCycleReport(token);
      setRows(res.rows ?? []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canUse) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('financialCycle.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('financialCycle.subtitle')}</p>
      </header>

      <Card className="rounded-[20px] border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('financialCycle.tableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('financialCycle.colOrder')}</TableHead>
                <TableHead className="text-end">{t('financialCycle.colAmount')}</TableHead>
                <TableHead>{t('financialCycle.colCollectedBy')}</TableHead>
                <TableHead>{t('financialCycle.colCollectedAt')}</TableHead>
                <TableHead>{t('financialCycle.colVerifiedBy')}</TableHead>
                <TableHead>{t('financialCycle.colVerifiedAt')}</TableHead>
                <TableHead>{t('financialCycle.colSlip')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ?
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">...</TableCell>
                </TableRow>
              : rows.length === 0 ?
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t('financialCycle.empty')}
                  </TableCell>
                </TableRow>
              : rows.map((row) => (
                  <TableRow key={row.orderId}>
                    <TableCell className="font-mono text-xs">{row.orderId}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(row.amountKd)}
                    </TableCell>
                    <TableCell>
                      {row.collectedByManager ?
                        `${row.collectedByManager.fullName} (@${row.collectedByManager.username})`
                      : '—'}
                    </TableCell>
                    <TableCell>
                      {row.collectedAt ?
                        new Date(row.collectedAt).toLocaleString(dateLocale, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—'}
                    </TableCell>
                    <TableCell>
                      {row.verifiedByAccountant ?
                        `${row.verifiedByAccountant.fullName} (@${row.verifiedByAccountant.username})`
                      : '—'}
                    </TableCell>
                    <TableCell>
                      {row.verifiedAt ?
                        new Date(row.verifiedAt).toLocaleString(dateLocale, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—'}
                    </TableCell>
                    <TableCell>
                      {row.receiptImageUrl ?
                        <a
                          href={row.receiptImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t('financialCycle.openSlip')}
                        </a>
                      : '—'}
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

