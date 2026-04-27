import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  type BranchRow,
  type IssuedInvoicesReport,
  type PaymentMethodFeeConfig,
  apiJson,
  ApiError,
  getPaymentMethodFeeConfig,
} from '@/lib/api';
import { sumEstimatedKnetFees } from '@/lib/knet-fee-estimate';
import {
  extractBankAmounts,
  extractTextFromStatementPdf,
  isLikelyUnextractableScannedStatement,
  parseStatementSummaryHints,
} from '@/lib/knet-statement-parse';
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

/** `datetime-local` is in local time; do not use `toISOString().slice(0,16)` for the value. */
function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localInputToIso(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

type RowStatus = 'green' | 'yellow' | 'red';

export function KnetAudit() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [from, setFrom] = useState(() => startOfDayIsoDaysAgo(30));
  const [to, setTo] = useState(() => endOfDayIso(new Date()));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<IssuedInvoicesReport | null>(null);
  const [statementName, setStatementName] = useState<string | null>(null);
  const [bankAmounts, setBankAmounts] = useState<number[]>([]);
  const [statementSummary, setStatementSummary] = useState<
    ReturnType<typeof parseStatementSummaryHints> | null
  >(null);
  const [feeConfig, setFeeConfig] = useState<PaymentMethodFeeConfig | null>(
    null,
  );
  const [commissionOverride, setCommissionOverride] = useState('');
  const [statementPdfError, setStatementPdfError] = useState<string | null>(
    null,
  );
  /** Per-order values copied from the bank statement (manual reconciliation). */
  const [manualAmountByOrderId, setManualAmountByOrderId] = useState<
    Record<string, string>
  >({});
  const [manualRefByOrderId, setManualRefByOrderId] = useState<
    Record<string, string>
  >({});
  /*
   * V19.18 — KNET audit is now scoped by BRANCH, not by driver.
   *
   * KNET terminals are assigned to branches (المحل / المحطة), not to
   * individual drivers. Two drivers on the same branch share the same
   * terminal, and many bank CSV exports are per-terminal. Filtering
   * by driver (as we did before) produced a smaller set than the bank
   * statement row-count on the same day and confused the accountant
   * into thinking money was missing. We filter by branch so the
   * row-count matches the bank terminal statement directly.
   */
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [branches, setBranches] = useState<BranchRow[] | null>(null);

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
    void apiJson<BranchRow[]>('/api/branches', { token })
      .then((rows) => setBranches(rows))
      .catch(() => setBranches(null));
  }, [token, allowed]);

  useEffect(() => {
    if (!token || !allowed) return;
    void getPaymentMethodFeeConfig(token)
      .then((c) => setFeeConfig(c))
      .catch(() => setFeeConfig(null));
  }, [token, allowed]);

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        posPaymentMethod: 'KNET',
        ...(branchFilter !== 'ALL' ? { branchId: branchFilter } : {}),
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
  }, [allowed, from, to, token, branchFilter]);

  const erpKnetTotals = useMemo(() => {
    if (!report) {
      return { gross: 0, feeEst: 0 };
    }
    const knet = report.rows.filter((r) => r.posPaymentMethod === 'KNET');
    const prices = knet.map((r) => r.totalPrice);
    const gross = prices.reduce(
      (a, s) => a + Number.parseFloat(s || '0'),
      0,
    );
    const feeEst =
      feeConfig ?
        sumEstimatedKnetFees(prices, {
          knetFlatKd: feeConfig.knetFlatKd,
          knetPercentOfGross: feeConfig.knetPercentOfGross,
          knetRule: feeConfig.knetRule,
        })
      : 0;
    return { gross, feeEst };
  }, [report, feeConfig]);

  const statementCommissionResolved = useMemo(() => {
    const o = commissionOverride.trim().replace(/,/g, '');
    if (o !== '') {
      const n = Number.parseFloat(o);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return statementSummary?.commission;
  }, [commissionOverride, statementSummary?.commission]);

  const feeDelta = useMemo(() => {
    if (statementCommissionResolved == null) return null;
    return statementCommissionResolved - erpKnetTotals.feeEst;
  }, [statementCommissionResolved, erpKnetTotals.feeEst]);

  const grossDelta = useMemo(() => {
    if (statementSummary?.totalGross == null) return null;
    return erpKnetTotals.gross - statementSummary.totalGross;
  }, [erpKnetTotals.gross, statementSummary?.totalGross]);

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
      const manualRaw = (manualAmountByOrderId[o.id] ?? '').trim();

      if (manualRaw !== '') {
        const manualVal = Number.parseFloat(manualRaw.replace(/,/g, ''));
        let status: RowStatus;
        if (!Number.isFinite(manualVal)) {
          status = 'yellow';
        } else if (Math.abs(manualVal - amount) < 0.002) {
          status = 'green';
        } else {
          status = 'red';
        }
        out.push({
          id: o.id,
          amount,
          at: tcomp,
          customer: o.customer.displayName || o.customer.phone,
          status,
        });
        continue;
      }

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
  }, [report, bankAmounts, manualAmountByOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStatementFile(file: File | null) {
    if (!file) {
      setStatementName(null);
      setBankAmounts([]);
      setStatementSummary(null);
      setStatementPdfError(null);
      return;
    }
    setStatementName(file.name);
    setStatementPdfError(null);
    setStatementSummary(null);
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    try {
      if (isPdf) {
        const buf = await file.arrayBuffer();
        const text = await extractTextFromStatementPdf(buf);
        if (isLikelyUnextractableScannedStatement(text)) {
          setStatementPdfError(t('knetAudit.pdfSeemsScanned'));
          setBankAmounts([]);
          setStatementSummary(null);
        } else {
          setStatementPdfError(null);
          const amounts = extractBankAmounts(text);
          setBankAmounts(amounts);
          setStatementSummary(parseStatementSummaryHints(text));
          if (amounts.length === 0) {
            toast.warning(t('knetAudit.pdfNoAmountsFound'));
          }
        }
      } else {
        const text = await file.text();
        const amounts = extractBankAmounts(text);
        setBankAmounts(amounts);
        setStatementSummary(null);
        if (amounts.length === 0) {
          toast.warning(t('knetAudit.pdfNoAmountsFound'));
        }
      }
    } catch (e) {
      setStatementPdfError(
        e instanceof Error ? e.message : t('knetAudit.pdfReadFailed'),
      );
      setBankAmounts([]);
    }
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
            value={toLocalInputValue(from)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setFrom(iso);
            }}
          />
        </FilterField>
        <FilterField label={t('knetAudit.to')}>
          <Input
            type="datetime-local"
            value={toLocalInputValue(to)}
            onChange={(e) => {
              const iso = localInputToIso(e.target.value);
              if (iso) setTo(iso);
            }}
          />
        </FilterField>
        {/*
         * V19.18 — filter by BRANCH (not driver). KNET terminals are
         * branch-scoped; all drivers on a branch share one terminal,
         * so this matches the way the bank reports come in.
         */}
        <FilterField label="الفرع" className="min-w-[12rem]">
          <Select
            value={branchFilter}
            onValueChange={(v) => setBranchFilter(v ?? 'ALL')}
          >
            <SelectTrigger>
              <SelectValue placeholder="كل الفروع">
                {branchFilter === 'ALL'
                  ? 'كل الفروع'
                  : ((branches ?? []).find((b) => b.id === branchFilter)
                      ?.name ?? 'كل الفروع')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل الفروع</SelectItem>
              {(branches ?? [])
                .filter((b) => b.isActive)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {canReconcile ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                {t('knetAudit.bankCsv')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('knetAudit.bankCsvHint')}
              </p>
              <Input
                type="file"
                accept=".csv,text/csv,application/pdf,.pdf"
                onChange={(e) => {
                  void onStatementFile(e.target.files?.[0] ?? null);
                }}
              />
              {statementPdfError ?
                <p className="text-xs text-destructive">{statementPdfError}</p>
              : null}
              {statementName ?
                <p className="text-xs text-slate-600">
                  {t('knetAudit.parsedAmounts', { count: bankAmounts.length })}
                </p>
              : null}
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {t('knetAudit.bankManualCard')}
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setManualAmountByOrderId({});
                  setManualRefByOrderId({});
                }}
              >
                {t('knetAudit.clearManual')}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('knetAudit.bankManualHint')}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {report ?
        <Card className="border-slate-200 bg-slate-50/80">
          <CardHeader>
            <CardTitle className="text-base">
              {t('knetAudit.statementCompare')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('knetAudit.parseNote')}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {t('knetAudit.erpKnetGross')}
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums" dir="ltr">
                {formatKwdLabel(erpKnetTotals.gross)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('knetAudit.systemFeeEst')}
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums" dir="ltr">
                {feeConfig ?
                  formatKwdLabel(erpKnetTotals.feeEst)
                : '—'}
              </p>
            </div>
            {statementSummary?.totalGross != null ?
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('knetAudit.statementGross')}
                </p>
                <p
                  className="font-mono text-lg font-semibold tabular-nums"
                  dir="ltr"
                >
                  {formatKwdLabel(statementSummary.totalGross)}
                </p>
              </div>
            : null}
            {statementSummary?.net != null ?
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('knetAudit.statementNet')}
                </p>
                <p
                  className="font-mono text-lg font-semibold tabular-nums"
                  dir="ltr"
                >
                  {formatKwdLabel(statementSummary.net)}
                </p>
              </div>
            : null}
            <div>
              <p className="text-xs text-muted-foreground">
                {t('knetAudit.statementCommission')}
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums" dir="ltr">
                {statementCommissionResolved != null ?
                  formatKwdLabel(statementCommissionResolved)
                : '—'}
              </p>
            </div>
            {canReconcile ?
              <div className="sm:col-span-2 lg:col-span-1">
                <p className="text-xs text-muted-foreground">
                  {t('knetAudit.statementCommissionOverride')}
                </p>
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  className="mt-1 h-8 font-mono tabular-nums"
                  value={commissionOverride}
                  onChange={(e) => setCommissionOverride(e.target.value)}
                  placeholder="0.000"
                />
              </div>
            : null}
            {feeDelta != null && feeConfig ?
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('knetAudit.feeDelta')}
                </p>
                <p
                  className={cn(
                    'font-mono text-lg font-semibold tabular-nums',
                    Math.abs(feeDelta) < 0.01 ? 'text-emerald-700' : 'text-amber-800',
                  )}
                  dir="ltr"
                >
                  {formatKwdLabel(feeDelta)}
                </p>
              </div>
            : null}
            {grossDelta != null ?
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('knetAudit.grossDelta')}
                </p>
                <p
                  className={cn(
                    'font-mono text-lg font-semibold tabular-nums',
                    Math.abs(grossDelta) < 0.01 ? 'text-emerald-700' : 'text-amber-800',
                  )}
                  dir="ltr"
                >
                  {formatKwdLabel(grossDelta)}
                </p>
              </div>
            : null}
          </CardContent>
        </Card>
      : null}

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
          {
            key: 'bankAmt',
            label: t('knetAudit.colBankStatementAmount'),
            align: 'end',
            numeric: true,
          },
          {
            key: 'bankRef',
            label: t('knetAudit.colBankRef'),
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
            <TableCell className="w-[1%] min-w-[6.5rem]">
              {canReconcile ? (
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  disabled={loading}
                  className="h-8 tabular-nums"
                  placeholder={t('knetAudit.bankAmountPlaceholder')}
                  value={manualAmountByOrderId[r.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setManualAmountByOrderId((prev) => {
                      const next = { ...prev };
                      if (v.trim() === '') delete next[r.id];
                      else next[r.id] = v;
                      return next;
                    });
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                  {manualAmountByOrderId[r.id]?.trim()
                    ? manualAmountByOrderId[r.id]
                    : '—'}
                </span>
              )}
            </TableCell>
            <TableCell className="min-w-[7rem] max-w-[12rem]">
              {canReconcile ? (
                <Input
                  disabled={loading}
                  className="h-8 text-xs"
                  placeholder={t('knetAudit.bankRefPlaceholder')}
                  value={manualRefByOrderId[r.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setManualRefByOrderId((prev) => {
                      const next = { ...prev };
                      if (v.trim() === '') delete next[r.id];
                      else next[r.id] = v;
                      return next;
                    });
                  }}
                />
              ) : (
                <span className="truncate text-xs text-muted-foreground">
                  {manualRefByOrderId[r.id]?.trim() || '—'}
                </span>
              )}
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
