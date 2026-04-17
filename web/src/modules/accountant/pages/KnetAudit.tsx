import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { type IssuedInvoicesReport, apiJson, ApiError } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';
import { hasMasterIslandAccess } from '@/modules/shared/auth/is-master-access';
import { Button } from '@/modules/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/shared/components/ui/card';
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
import { cn } from '@/lib/utils';

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
  const { token, user, hasRole } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIso(new Date()));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<IssuedInvoicesReport | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [bankAmounts, setBankAmounts] = useState<number[]>([]);

  const allowed =
    hasMasterIslandAccess(user) || hasRole('ACCOUNTANT');

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        posPaymentMethod: 'KNET',
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
  }, [allowed, from, to, token]);

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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t('knetAudit.title')}
        </h1>
        <p className="text-sm text-slate-600">{t('knetAudit.subtitle')}</p>
      </header>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{t('knetAudit.filters')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>{t('knetAudit.from')}</Label>
            <Input
              type="datetime-local"
              value={from.slice(0, 16)}
              onChange={(e) => setFrom(new Date(e.target.value).toISOString())}
              className="w-auto"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('knetAudit.to')}</Label>
            <Input
              type="datetime-local"
              value={to.slice(0, 16)}
              onChange={(e) => setTo(new Date(e.target.value).toISOString())}
              className="w-auto"
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : null}
            {t('knetAudit.loadOrders')}
          </Button>
        </CardContent>
      </Card>

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

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-base">{t('knetAudit.matchTable')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !report ?
            <p className="p-6 text-sm text-slate-500">{t('knetAudit.loading')}</p>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('knetAudit.colStatus')}</TableHead>
                  <TableHead>{t('knetAudit.colOrder')}</TableHead>
                  <TableHead>{t('knetAudit.colWhen')}</TableHead>
                  <TableHead>{t('knetAudit.colCustomer')}</TableHead>
                  <TableHead className="text-end">{t('knetAudit.colAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableCell className="font-mono text-xs">{r.id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-sm">{new Date(r.at).toLocaleString()}</TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKwdLabel(r.amount.toFixed(3))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
