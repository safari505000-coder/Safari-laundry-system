import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  CreditCard,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  type CallCenterOperationsSummary,
  type CollectionUnpaidOnlineRow,
  type ReminderResult,
  apiJson,
  ApiError,
} from '@/lib/api';
import {
  buildCollectionsUnpaidWhatsAppText,
  whatsappChatNumber,
} from '@/modules/shared/lib/whatsapp-links';
import { Button } from '@/modules/shared/components/ui/button';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Input } from '@/modules/shared/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';
import { formatKwdLabel } from '@/lib/kwd';
import { cn } from '@/lib/utils';

/** Faster refresh for debt-radar follow-up (WhatsApp triggers). */
const POLL_MS = 8_000;

/** Ops KPI poll runs on the same heartbeat but can afford to drift a bit. */
const SUMMARY_POLL_MS = 15_000;

/**
 * Normalise a phone-ish string for comparison: keep digits only so that
 * "+965 5000 1234", "96550001234", and "50001234" all match.
 */
function normalisePhone(value: string): string {
  return value.replace(/\D+/g, '');
}

type KpiTone = 'red' | 'green' | 'yellow';

const KPI_TONE: Record<KpiTone, { border: string; bg: string; accent: string; icon: string }> = {
  red: {
    border: 'border-red-200 dark:border-red-900/60',
    bg: 'bg-red-50/80 dark:bg-red-950/40',
    accent: 'text-red-700 dark:text-red-200',
    icon: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200',
  },
  green: {
    border: 'border-emerald-200 dark:border-emerald-900/60',
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/40',
    accent: 'text-emerald-700 dark:text-emerald-200',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
  },
  yellow: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bg: 'bg-amber-50/80 dark:bg-amber-950/40',
    accent: 'text-amber-700 dark:text-amber-200',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200',
  },
};

type KpiCardProps = {
  tone: KpiTone;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  loading: boolean;
};

function KpiCard({ tone, icon, label, value, sub, loading }: KpiCardProps) {
  const c = KPI_TONE[tone];
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border p-4 shadow-sm',
        c.border,
        c.bg,
      )}
    >
      <div className={cn('grid h-11 w-11 place-items-center rounded-lg', c.icon)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold tabular-nums', c.accent)}>
          {loading ? '—' : value}
        </p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

export function CollectionsPage() {
  const { t } = useTranslation();
  const { token, hasRole } = useAuth();
  const allowed = hasRole('OWNER', 'CALL_CENTER');
  const [rows, setRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CallCenterOperationsSummary | null>(
    null,
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        const data = await apiJson<CollectionUnpaidOnlineRow[]>(
          '/api/orders/collections/unpaid-online',
          { token },
        );
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, allowed],
  );

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setSummaryLoading(true);
      try {
        const data = await apiJson<CallCenterOperationsSummary>(
          '/api/call-center/operations-summary',
          { token },
        );
        setSummary(data);
      } catch (e) {
        // Non-fatal: just keep showing the last known value. The main list is
        // what actually drives operator workflow.
        if (e instanceof ApiError && !opts?.silent) toast.error(e.message);
      } finally {
        if (!opts?.silent) setSummaryLoading(false);
      }
    },
    [token, allowed],
  );

  useEffect(() => {
    void load();
    void loadSummary();
  }, [load, loadSummary]);

  useEffect(() => {
    if (!token || !allowed) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, allowed, load]);

  useEffect(() => {
    if (!token || !allowed) return;
    const id = window.setInterval(() => {
      void loadSummary({ silent: true });
    }, SUMMARY_POLL_MS);
    return () => window.clearInterval(id);
  }, [token, allowed, loadSummary]);

  /**
   * Dastur V1.5.2 — WhatsApp action is now guarded by the 24h reminder
   * counter. We bump the counter server-side first (atomic), then open
   * wa.me in a new tab on success. If the cooldown is still active we
   * surface it but do not open WhatsApp — the row-level `canRemindNow`
   * flag already disables the button.
   */
  const handleWhatsApp = useCallback(
    async (row: CollectionUnpaidOnlineRow) => {
      if (!token) return;
      const n = whatsappChatNumber(row.customerPhone);
      if (!n) {
        toast.error(t('collections.whatsappNoPhone'));
        return;
      }
      setReminderBusyId(row.orderId);
      try {
        const res = await apiJson<ReminderResult>(
          `/api/call-center/orders/${row.orderId}/reminder`,
          { method: 'POST', token },
        );
        if (!res.sent) {
          toast.warning(
            t('collections.remindCooldown', {
              hours: res.hoursUntilNext ?? 24,
            }),
          );
          await load({ silent: true });
          return;
        }
        const text = buildCollectionsUnpaidWhatsAppText(row);
        const href = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
        window.open(href, '_blank', 'noopener,noreferrer');
        toast.success(
          t('collections.remindSentToast', { count: res.reminderCount }),
        );
        await load({ silent: true });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setReminderBusyId(null);
      }
    },
    [token, t, load],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const digits = normalisePhone(q);
    const nameNeedle = q.toLowerCase();
    return rows.filter((r) => {
      if (digits && normalisePhone(r.customerPhone).includes(digits)) return true;
      if (r.customerName?.toLowerCase().includes(nameNeedle)) return true;
      return false;
    });
  }, [rows, query]);

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  const kpiMarketDebt = summary
    ? formatKwdLabel(summary.totalMarketDebtKd)
    : '—';
  const kpiCollectedToday = summary
    ? formatKwdLabel(summary.debtCollectedTodayKd)
    : '—';
  const kpiPendingLinks = summary ? String(summary.pendingLinksCount) : '—';

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 py-4 sm:space-y-6 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t('collections.title')}
            </h1>
            <Badge variant="secondary" className="font-normal">
              {filteredRows.length} {t('collections.radarBadge')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t('collections.subtitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('collections.debtRadarHint', { seconds: POLL_MS / 1000 })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            void load({ silent: false });
            void loadSummary({ silent: false });
          }}
        >
          {loading ?
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          : <RefreshCw className="me-2 h-4 w-4" />}
          {t('collections.refresh')}
        </Button>
      </header>

      {/* Dastur §5 — 3 KPI cards (Red / Green / Yellow). */}
      <section
        aria-label={t('collections.opsDashboardAria')}
        className="grid gap-3 sm:grid-cols-3"
      >
        <KpiCard
          tone="red"
          icon={<Wallet className="h-5 w-5" aria-hidden />}
          label={t('collections.kpiMarketDebtLabel')}
          value={kpiMarketDebt}
          sub={t('collections.kpiMarketDebtSub')}
          loading={summaryLoading && !summary}
        />
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-5 w-5" aria-hidden />}
          label={t('collections.kpiCollectedTodayLabel')}
          value={kpiCollectedToday}
          sub={t('collections.kpiCollectedTodaySub')}
          loading={summaryLoading && !summary}
        />
        <KpiCard
          tone="yellow"
          icon={<Link2 className="h-5 w-5" aria-hidden />}
          label={t('collections.kpiPendingLinksLabel')}
          value={kpiPendingLinks}
          sub={t('collections.kpiPendingLinksSub')}
          loading={summaryLoading && !summary}
        />
      </section>

      {/* Phone search — narrows the radar to a specific customer/phone. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          inputMode="tel"
          placeholder={t('collections.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9"
        />
      </div>

      <div className="md:hidden">
        {loading && filteredRows.length === 0 ?
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        : null}
        {!loading && filteredRows.length === 0 ?
          <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
            {query.trim() ? t('collections.emptySearch') : t('collections.empty')}
          </p>
        : null}
        <ul className="flex flex-col gap-3">
          {filteredRows.map((row) => {
            const reminderBusy = reminderBusyId === row.orderId;
            const ageBadgeTone =
              row.invoiceAgeDays >= 7
                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200'
                : row.invoiceAgeDays >= 3
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                  : 'bg-muted text-muted-foreground';
            return (
              <li
                key={row.orderId}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="font-mono text-[11px] text-muted-foreground">{row.orderId}</p>
                <p className="mt-1 font-semibold text-foreground">{row.customerName}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{row.customerPhone}</p>
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground">
                  {row.amountKd} KWD
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 font-medium tabular-nums',
                      ageBadgeTone,
                    )}
                  >
                    {t('collections.colDaysElapsed')}: {row.invoiceAgeDays}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium tabular-nums text-muted-foreground">
                    {t('collections.colReminders')}: {row.reminderCount}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    type="button"
                    size="default"
                    className="min-h-12 flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={reminderBusy || !row.canRemindNow}
                    onClick={() => void handleWhatsApp(row)}
                    title={
                      row.canRemindNow
                        ? t('collections.whatsapp')
                        : t('collections.remindCooldownShort')
                    }
                  >
                    {reminderBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
                    )}
                    {t('collections.whatsapp')}
                  </Button>
                  {row.paymentUrl ?
                    <a
                      href={row.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                      title={t('collections.paymentLink')}
                    >
                      <CreditCard className="h-5 w-5" />
                    </a>
                  : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('collections.colOrderId')}</TableHead>
              <TableHead>{t('collections.colCustomer')}</TableHead>
              <TableHead>{t('collections.colPhone')}</TableHead>
              <TableHead className="text-end">
                {t('collections.colAmount')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('collections.colDaysElapsed')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('collections.colReminders')}
              </TableHead>
              <TableHead className="w-[260px] text-center">
                {t('collections.colActions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            : null}
            {!loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  {query.trim() ? t('collections.emptySearch') : t('collections.empty')}
                </TableCell>
              </TableRow>
            : null}
            {filteredRows.map((row) => {
              const reminderBusy = reminderBusyId === row.orderId;
              const ageTone =
                row.invoiceAgeDays >= 7
                  ? 'text-red-700 dark:text-red-300'
                  : row.invoiceAgeDays >= 3
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-foreground';
              return (
                <TableRow key={row.orderId}>
                  <TableCell className="font-mono text-xs">
                    {row.orderId}
                  </TableCell>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell className="tabular-nums">{row.customerPhone}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.amountKd}
                  </TableCell>
                  <TableCell
                    className={cn('text-end tabular-nums font-medium', ageTone)}
                  >
                    {row.invoiceAgeDays}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.reminderCount}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-9 min-w-[120px] gap-1.5"
                        disabled={reminderBusy || !row.canRemindNow}
                        onClick={() => void handleWhatsApp(row)}
                        title={
                          row.canRemindNow
                            ? t('collections.whatsapp')
                            : t('collections.remindCooldownShort')
                        }
                      >
                        {reminderBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <MessageCircle className="h-4 w-4" aria-hidden />
                        )}
                        {t('collections.whatsapp')}
                      </Button>
                      {row.paymentUrl ?
                        <a
                          href={row.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          title={t('collections.paymentLink')}
                        >
                          <CreditCard className="h-4 w-4" />
                        </a>
                      : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
