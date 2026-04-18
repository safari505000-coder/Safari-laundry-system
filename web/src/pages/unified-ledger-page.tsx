import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2, Paperclip, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  getUnifiedLedgerStream,
  type DriverBalanceResponse,
  type UnifiedLedgerStreamRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import { formatKwdLabel } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
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

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function streamLabelKey(streamType: string): string {
  const map: Record<string, string> = {
    CASH_SALE: 'unifiedLedger.streamCashSale',
    KNET_SALE: 'unifiedLedger.streamKnetSale',
    ONLINE_SALE: 'unifiedLedger.streamOnlineSale',
    DEBT_SALE: 'unifiedLedger.streamDebt',
    WALLET_SALE: 'unifiedLedger.streamWallet',
    OTHER_SALE: 'unifiedLedger.streamOtherSale',
    FUEL_EXPENSE: 'unifiedLedger.streamFuelExpense',
    OTHER_EXPENSE: 'unifiedLedger.streamOtherExpense',
    DEPOSIT: 'unifiedLedger.streamDeposit',
  };
  return map[streamType] ?? 'unifiedLedger.streamOther';
}

function downloadCsv(filename: string, rows: UnifiedLedgerStreamRow[]) {
  const headers = ['at', 'streamType', 'amountKd', 'driverName', 'memo', 'refKind', 'refId'];
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.at,
        r.streamType,
        r.amountKd,
        (r.driverName ?? '').replaceAll(',', ' '),
        (r.memo ?? '').replaceAll(',', ' '),
        r.refKind,
        r.refId,
      ].join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UnifiedLedgerPage() {
  const { t } = useTranslation();
  const dateLocale = useAppLocale();
  const { token, hasRole, ownerBranchId } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [driverId, setDriverId] = useState<string>('ALL');
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);
  const [rows, setRows] = useState<UnifiedLedgerStreamRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const allowed = hasRole('ACCOUNTANT', 'OWNER') ?? false;

  useEffect(() => {
    if (!token || !allowed) return;
    void apiJson<DriverBalanceResponse>('/api/finance/driver-balance', { token })
      .then((d) => setDrivers(d))
      .catch(() => setDrivers(null));
  }, [token, allowed]);

  const driverOptions = useMemo(() => {
    const list = drivers?.drivers ?? [];
    if (!ownerBranchId) return list;
    return list.filter((d) => d.branchId === ownerBranchId);
  }, [drivers, ownerBranchId]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getUnifiedLedgerStream(token, {
        from,
        to,
        ...(driverId !== 'ALL' ? { driverId } : {}),
        ...(ownerBranchId ? { branchId: ownerBranchId } : {}),
      });
      setRows(data.rows);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, driverId, ownerBranchId]);

  useEffect(() => {
    if (token && allowed) void load();
  }, [token, allowed, load]);

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('unifiedLedger.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('unifiedLedger.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/knet-audit"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {t('unifiedLedger.openKnetCsv')}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!rows?.length}
            onClick={() =>
              rows &&
              downloadCsv(
                `unified-ledger-${from.slice(0, 10)}-${to.slice(0, 10)}.csv`,
                rows,
              )
            }
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t('unifiedLedger.exportCsv')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
            {t('reports.refresh')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('reports.filters')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ul-from">{t('reports.from')}</Label>
            <Input
              id="ul-from"
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ul-to">{t('reports.to')}</Label>
            <Input
              id="ul-to"
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('reports.driver')}</Label>
            <Select value={driverId} onValueChange={(v) => setDriverId(v ?? 'ALL')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('reports.all')}</SelectItem>
                {driverOptions.map((d) => (
                  <SelectItem key={d.driverId} value={d.driverId}>
                    {d.fullName} ({d.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" className="w-full" disabled={loading} onClick={() => void load()}>
              {t('reports.run')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('unifiedLedger.streamTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6 pt-0">
          {loading && !rows ?
            <p className="p-6 text-sm text-muted-foreground">{t('unifiedLedger.loading')}</p>
          : rows && rows.length === 0 ?
            <p className="p-6 text-sm text-muted-foreground">{t('unifiedLedger.empty')}</p>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.colCreated')}</TableHead>
                  <TableHead>{t('unifiedLedger.colStream')}</TableHead>
                  <TableHead>{t('reports.colDriver')}</TableHead>
                  <TableHead>{t('unifiedLedger.colMemo')}</TableHead>
                  <TableHead className="w-[48px] text-center">{t('unifiedLedger.colAttach')}</TableHead>
                  <TableHead className="text-end">{t('reports.colTotal')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(r.at).toLocaleString(dateLocale)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {t(streamLabelKey(r.streamType))}
                    </TableCell>
                    <TableCell className="text-sm">{r.driverName ?? '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                      {r.memo ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.attachmentUrl ?
                        <a
                          href={r.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-primary hover:opacity-90"
                          title={t('unifiedLedger.openAttachment')}
                        >
                          <Paperclip className="h-4 w-4" />
                        </a>
                      : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-sm">
                      {formatKwdLabel(r.amountKd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
