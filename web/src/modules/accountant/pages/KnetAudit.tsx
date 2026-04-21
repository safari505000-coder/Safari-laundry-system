import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type DriverBalanceResponse,
  type IssuedInvoicesReport,
  apiJson,
  ApiError,
} from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { can } from '@/modules/shared/auth/access-matrix';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/modules/shared/components/ui/card';
import { Input } from '@/modules/shared/components/ui/input';
import { TableCell, TableRow } from '@/modules/shared/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/shared/components/ui/select';
import {
  DataTableShell,
  FilterBar,
  FilterField,
  PageHeader,
} from '@/modules/shared/components/page';
import { cn } from '@/lib/utils';

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

/**
 * V19.9.3 — default the audit window to the last 30 days instead of
 * "today only". KNET reconciliation is retrospective work; opening on
 * an empty table whenever a day has no K-Net made the accountant
 * think the page was broken. Thirty days also matches the typical
 * bank-statement export cycle accountants reconcile against.
 */
function startOfDayIsoDaysAgo(daysAgo: number): string {
  const x = new Date();
  x.setDate(x.getDate() - daysAgo);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/** Extract KWD-like amounts (up to 4 dp) from CSV text for reconciliation. */
function extractBankAmounts(csvText: string): number[] {
  const amounts: number[] = [];
  const re = /\b\d+(?:\.\d{1,4})?\b/g;
  for (const line of csvText.split(/\r?\n/)) {
    for (const m of line.matchAll(re)) {
      const v = Number.parseFloat(m[0]);
      if (Number.isFinite(v) && v > 0 && v < 50000) amounts.push(v);
    }
  }
  return amounts;
}

type RowStatus = 'green' | 'yellow' | 'red';

export function KnetAudit() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIsoDaysAgo(30));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<IssuedInvoicesReport | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [bankAmounts, setBankAmounts] = useState<number[]>([]);
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [drivers, setDrivers] = useState<DriverBalanceResponse | null>(null);

  const allowed = can(user, 'knetAudit.view');
  /*
   * Dastur V1.5.4 — role separation. ACCOUNTANT gets the full workbench
   * (CSV upload, reconciliation). OWNER (and other non-ACCOUNTANT master
   * roles) get a strictly read-only view of the finished report. We gate
   * the CSV upload card on this flag so the Owner cannot accidentally
   * side-load a bank export that would flip all rows to green/yellow in
   * their browser session — reconciliation is an accountant duty.
   */
  const canReconcile = can(user, 'knetAudit.reconcile');

  useEffect(() => {
    if (!token || !allowed) return;
    void apiJson<DriverBalanceResponse>('/api/finance/driver-balance', { token })
      .then((d) => setDrivers(d))
      .catch(() => setDrivers(null));
  }, [token, allowed]);

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        posPaymentMethod: 'KNET',
        ...(driverFilter !== 'ALL' ? { driverId: driverFilter } : {}),
      });
      const data = await apiJson<IssuedInvoicesReport>(
        `/api/reports/issued-invoices?${qs.toString()}`,
        { token },
      );
      setReport(data);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [allowed, from, to, token, driverFilter]);

  const { rows, unmatchedBank } = useMemo(() => {
    if (!report) {
      return {
        rows: [] as Array<{
          id: string;
          amount: number;
          at: string;
          customer: string;
          status: RowStatus;
        }>,
        unmatchedBank: [] as number[],
      };
    }
    const knetOrders = report.rows.filter((r) => r.posPaymentMethod === 'KNET');
    const usedBank = new Set<number>();
    const out: Array<{
      id: string;
      amount: number;
      at: string;
      customer: string;
      status: RowStatus;
    }> = [];

    for (const o of knetOrders) {
      const amount = Number.parseFloat(o.totalPrice || '0');
      const tcomp = o.completedAt || o.createdAt;
      const loose = bankAmounts
        .map((b, i) => ({ b, i }))
        .filter(
          ({ b, i }) => !usedBank.has(i) && Math.abs(b - amount) < 0.002,
        );

      let status: RowStatus = 'red';
      if (bankAmounts.length === 0) {
        status = 'yellow';
      } else if (loose.length === 1) {
        status = 'green';
        usedBank.add(loose[0].i);
      } else if (loose.length > 1) {
        status = 'yellow';
      }

      out.push({
        id: o.id,
        amount,
        at: tcomp,
        customer: o.customer.displayName || o.customer.phone,
        status,
      });
    }

    const unmatchedBank =
      bankAmounts.length === 0 ? [] : bankAmounts.filter((_, i) => !usedBank.has(i));

    return { rows: out, unmatchedBank };
  }, [report, bankAmounts]);

  useEffect(() => {
    void load();
  }, [load]);

  function onCsv(file: File | null) {
    if (!file) {
      setCsvName(null);
      setBankAmounts([]);
      return;
    }
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setBankAmounts(extractBankAmounts(text));
    };
    reader.readAsText(file);
  }

  if (!allowed) return <Navigate to="/" replace />;

  /*
   * Dastur §2.2 — This page is strictly for BANK ↔ K-Net reconciliation.
   * Cash-side metrics (Drivers' cash, Managers' pending deposits, Daily
   * Net) belong on the Dashboard / Cash Reports and are intentionally
   * NOT rendered here to keep the auditor's focus on KNET vs. bank CSV.
   */

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('knetAudit.title')}
        subtitle={t('knetAudit.subtitle')}
        tone="blue"
      />

      <FilterBar
        actions={
          canReconcile ? (
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t('knetAudit.loadOrders')}
            </Button>
          ) : null
        }
      >
        <FilterField label={t('knetAudit.from')}>
          <Input
            type="datetime-local"
            value={from.slice(0, 16)}
            onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
          />
        </FilterField>
        <FilterField label={t('knetAudit.to')}>
          <Input
            type="datetime-local"
            value={to.slice(0, 16)}
            onChange={(e) => setTo(new Date(e.target.value).toISOString())}
          />
        </FilterField>
        <FilterField label={t('reports.driver')} className="min-w-[12rem]">
          <Select
            value={driverFilter}
            onValueChange={(v) => setDriverFilter(v ?? 'ALL')}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('reports.all')}>
                {driverFilter === 'ALL'
                  ? t('reports.all')
                  : ((drivers?.drivers ?? []).find(
                      (d) => d.driverId === driverFilter,
                    )?.fullName ?? t('reports.all'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('reports.all')}</SelectItem>
              {(drivers?.drivers ?? []).map((d) => (
                <SelectItem key={d.driverId} value={d.driverId}>
                  {d.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {canReconcile ? (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              {t('knetAudit.bankCsv')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onCsv(e.target.files?.[0] ?? null)}
            />
            {csvName ?
              <p className="text-xs text-slate-600">
                {t('knetAudit.parsedAmounts', { count: bankAmounts.length })}
              </p>
            : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-foreground">
          {t('knetAudit.matchTable')}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          عدد العمليات: <b className="text-foreground">{rows.length}</b>
        </span>
      </div>

      <DataTableShell
        columns={[
          { key: 'status', label: t('knetAudit.colStatus') },
          { key: 'order', label: t('knetAudit.colOrder') },
          { key: 'at', label: t('knetAudit.colWhen') },
          { key: 'customer', label: t('knetAudit.colCustomer') },
          {
            key: 'amount',
            label: t('knetAudit.colAmount'),
            align: 'end',
            numeric: true,
          },
        ]}
        loading={loading && !report}
        loadingState={t('knetAudit.loading')}
        empty={rows.length === 0}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              لا توجد عمليات كي نت في الفترة المحددة
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              جرّب توسعة النطاق الزمني من الأعلى (تاريخ «من» أقدم)، أو
              تأكّد أن هناك فواتير طريقة دفعها «كي نت» فعلياً ضمن هذه
              الفترة. النطاق الافتراضي يُعرض عليك آخر 30 يوماً.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFrom(startOfDayIsoDaysAgo(90));
                setTo(endOfDayIso(new Date()));
              }}
            >
              توسعة إلى آخر 90 يوم
            </Button>
          </div>
        }
      >
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                  r.status === 'green' && 'bg-emerald-100 text-emerald-900',
                  r.status === 'yellow' && 'bg-amber-100 text-amber-950',
                  r.status === 'red' && 'bg-red-100 text-red-900',
                )}
              >
                {t(`knetAudit.status.${r.status}`)}
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.id.slice(0, 8)}…
            </TableCell>
            <TableCell className="text-sm">
              {new Date(r.at).toLocaleString('en-GB')}
            </TableCell>
            <TableCell>{r.customer}</TableCell>
            <TableCell className="text-end tabular-nums">
              {formatKwdLabel(r.amount.toFixed(3))}
            </TableCell>
          </TableRow>
        ))}
      </DataTableShell>

      {unmatchedBank.length > 0 ?
        <Card className="border-amber-200 bg-amber-50/80">
          <CardHeader>
            <CardTitle className="text-base text-amber-950">
              {t('knetAudit.unmatchedBank')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc text-sm text-amber-950">
              {unmatchedBank.map((a, i) => (
                <li key={`${a}-${i}`} className="tabular-nums">
                  {formatKwdLabel(a.toFixed(3))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      : null}
    </div>
  );
}
