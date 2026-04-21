import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BarChart3, Fuel, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  ApiError,
  getVehicleExpenseReport,
  type VehicleExpenseReport,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

function isoDay(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function firstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return isoDay(d);
}

export function VehicleExpensesReportPage() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const canView = can(user, 'vehicleExpenses.report.view');

  const [fromIso, setFromIso] = useState(firstOfMonth);
  const [toIso, setToIso] = useState(() => isoDay(new Date()));
  const [data, setData] = useState<VehicleExpenseReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !canView) return;
      if (!opts?.silent) setLoading(true);
      try {
        const from = new Date(fromIso);
        from.setHours(0, 0, 0, 0);
        const to = new Date(toIso);
        to.setHours(23, 59, 59, 999);
        const res = await getVehicleExpenseReport(token, {
          from: from.toISOString(),
          to: to.toISOString(),
        });
        setData(res);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
        else toast.error(t('vehicleExpenses.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [token, canView, fromIso, toIso, t],
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  const hasData = useMemo(() => Boolean(data && data.count > 0), [data]);

  if (!canView) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Fuel className="h-6 w-6 text-primary" />
            {t('vehicleExpenses.reportTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('vehicleExpenses.reportSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="from">{t('vehicleExpenses.fromLabel')}</Label>
            <Input
              id="from"
              type="date"
              value={fromIso}
              onChange={(e) => setFromIso(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="to">{t('vehicleExpenses.toLabel')}</Label>
            <Input
              id="to"
              type="date"
              value={toIso}
              onChange={(e) => setToIso(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label={t('vehicleExpenses.report.totalKd')}
              value={formatKwdLabel(data.totalKd)}
              tone="green"
            />
            <KpiCard
              label={t('vehicleExpenses.report.operations')}
              value={String(data.count)}
              tone="blue"
            />
            <KpiCard
              label={t('vehicleExpenses.report.byVehicle')}
              value={String(data.byVehicle.length)}
              tone="purple"
            />
            <KpiCard
              label={t('vehicleExpenses.report.byType')}
              value={String(data.byType.length)}
              tone="orange"
            />
          </div>

          {!hasData ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t('vehicleExpenses.report.empty')}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4" />
                    {t('vehicleExpenses.report.byVehicle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('vehicleExpenses.colVehicle')}
                        </TableHead>
                        <TableHead className="text-end">
                          {t('vehicleExpenses.colCount')}
                        </TableHead>
                        <TableHead className="text-end tabular-nums">
                          {t('vehicleExpenses.colAmount')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byVehicle.map((row) => (
                        <TableRow key={row.vehiclePlate}>
                          <TableCell>
                            <div className="font-medium">
                              {row.vehiclePlate}
                            </div>
                            {row.vehicleLabel ? (
                              <div className="text-xs text-muted-foreground">
                                {row.vehicleLabel}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {row.count}
                          </TableCell>
                          <TableCell className="text-end font-semibold tabular-nums">
                            {formatKwdLabel(row.amountKd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('vehicleExpenses.report.byType')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('vehicleExpenses.colType')}</TableHead>
                        <TableHead className="text-end">
                          {t('vehicleExpenses.colCount')}
                        </TableHead>
                        <TableHead className="text-end tabular-nums">
                          {t('vehicleExpenses.colAmount')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byType.map((row) => (
                        <TableRow key={row.expenseType}>
                          <TableCell>
                            {t(
                              `vehicleExpenses.typeLabel.${row.expenseType}`,
                            )}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {row.count}
                          </TableCell>
                          <TableCell className="text-end font-semibold tabular-nums">
                            {formatKwdLabel(row.amountKd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('vehicleExpenses.report.byMonth')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('vehicleExpenses.colMonth')}</TableHead>
                        <TableHead className="text-end">
                          {t('vehicleExpenses.colCount')}
                        </TableHead>
                        <TableHead className="text-end tabular-nums">
                          {t('vehicleExpenses.colAmount')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byMonth.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="tabular-nums">
                            {row.month}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {row.count}
                          </TableCell>
                          <TableCell className="text-end font-semibold tabular-nums">
                            {formatKwdLabel(row.amountKd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'purple' | 'orange';
}) {
  const toneMap = {
    green:
      'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    purple:
      'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
    orange:
      'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
  };
  return (
    <div
      className={`rounded-xl border border-border p-4 shadow-sm ${toneMap[tone]}`}
    >
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
