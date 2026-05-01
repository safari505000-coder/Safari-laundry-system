import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Globe,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  type CallCenterOperationsSummary,
  type CollectionUnpaidOnlineRow,
  type MarkOrderPaidResult,
  type MarkPaidMethod,
  type SendPaymentLinkWhatsappResult,
  apiJson,
  ApiError,
  recheckOrderPayment,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DailyCollectorPanel } from '@/modules/call-center/components/daily-collector-panel';

/**
 * V1.6.5 — KWD standard = 3 decimal places (fils). The Collections
 * island is the source of truth for debt-tracking precision, so we
 * format locally instead of reaching for the shared 4dp helper (which
 * stays intact for legacy screens that depend on it).
 *
 * Accepts both decimal strings (backend DTO) and plain numbers (local
 * reductions). Returns "<n>.nnn د.ك" — e.g. "2.400 د.ك".
 */
const KWD_SUFFIX = ' د.ك';
function formatKwd3(value: string | number): string {
  const raw = typeof value === 'number' ? value : Number.parseFloat(value || '0');
  if (!Number.isFinite(raw)) return `${String(value)}${KWD_SUFFIX}`;
  return `${raw.toLocaleString('en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}${KWD_SUFFIX}`;
}

/** Faster refresh so the debt-radar reflects new/cleared invoices quickly. */
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

function waSendButtonTitle(
  t: TFunction,
  row: CollectionUnpaidOnlineRow,
  _isCcAgent: boolean,
): string {
  const canSend = row.canSendCollectionPaymentWa ?? row.canRemindNow;
  if (!canSend) {
    return String(t('collections.remindCooldownShort'));
  }
  return String(t('collections.whatsapp'));
}

function canSendCollectionWaRow(row: CollectionUnpaidOnlineRow): boolean {
  return row.canSendCollectionPaymentWa ?? row.canRemindNow;
}

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
  const { token, user, ownerBranchId } = useAuth();
  /** Manager defaults to their branch; Owner uses the branch switcher when set. */
  const collectionsBranchId = useMemo(() => {
    if (user?.safariRole === 'MANAGER' && user.branchId) {
      return user.branchId;
    }
    return ownerBranchId;
  }, [user?.safariRole, user?.branchId, ownerBranchId]);
  const isCcAgent = useMemo(
    () =>
      user?.safariRole === 'CALL_CENTER' ||
      user?.safariRole === 'CALL_CENTER_SUPERVISOR',
    [user?.safariRole],
  );
  const allowed = can(user, 'collections.view');
  const canAct = can(user, 'collections.act');
  const canSubscribers = can(user, 'subscribers.view');
  const canSubscribersManage = can(user, 'subscribers.manage');
  const tableColCount = 7 + (canSubscribers ? 1 : 0) + (canAct ? 1 : 0);
  const [rows, setRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CallCenterOperationsSummary | null>(
    null,
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);
  // V1.6.0 — "Payment Link" button is now universal (Cash + KNET + …).
  // We track which row is currently minting a link so the user gets a
  // spinner while the gateway call is in flight.
  // V1.6.9 — "تم الدفع" manual confirmation flow. We keep the row that
  // the agent picked so the dialog shows the customer name + amount, and
  // we track which method is currently submitting so the picked button
  // shows a spinner while the others stay enabled for correction.
  const [markPaidRow, setMarkPaidRow] = useState<CollectionUnpaidOnlineRow | null>(
    null,
  );
  const [markPaidBusy, setMarkPaidBusy] = useState<MarkPaidMethod | null>(null);
  const [recheckingOrderId, setRecheckingOrderId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        // V1.6.5 — forward branch scope (owner switcher, or manager’s branch).
        const qs = collectionsBranchId
          ? `?branchId=${encodeURIComponent(collectionsBranchId)}`
          : '';
        const data = await apiJson<CollectionUnpaidOnlineRow[]>(
          `/api/orders/collections/unpaid-online${qs}`,
          { token },
        );
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [token, allowed, collectionsBranchId],
  );

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setSummaryLoading(true);
      try {
        // V1.6.1 — same branch scope as the unpaid list (owner / manager).
        const qs = collectionsBranchId
          ? `?branchId=${encodeURIComponent(collectionsBranchId)}`
          : '';
        const data = await apiJson<CallCenterOperationsSummary>(
          `/api/call-center/operations-summary${qs}`,
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
    [token, allowed, collectionsBranchId],
  );

  /** UPayments inquiry — same as customer «إعادة التحقق»; for hosted link / online orders. */
  const canRecheckGatewayPayment = (row: CollectionUnpaidOnlineRow) =>
    row.paymentMethod === 'PAYMENT_LINK' || row.paymentMethod === 'ONLINE';

  const handleGatewayRecheck = useCallback(
    async (orderId: string) => {
      if (!token) return;
      setRecheckingOrderId(orderId);
      try {
        const res = await recheckOrderPayment(token, orderId);
        if (res.settledNow && res.isPaid) {
          toast.success(res.messageAr);
        } else {
          toast.info(res.messageAr);
        }
        await load({ silent: true });
        await loadSummary({ silent: true });
      } catch (e) {
        toast.error(
          e instanceof ApiError
            ? e.message
            : t('collections.recheckError', 'تعذّر التحقق من الدفع.'),
        );
      } finally {
        setRecheckingOrderId(null);
      }
    },
    [token, load, loadSummary, t],
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
   * Dastur V1.5.2 + V1.6.6 — "Send Payment Link" flow.
   *
   * Primary: POST `send-payment-link-whatsapp` → Moatmt / webhook delivers
   * the Arabic template to the customer's number (no manual Send in WhatsApp).
   * Fallback when the server has no channel: same `wa.me` pre-fill as before.
   */
  const handleWhatsApp = useCallback(
    async (row: CollectionUnpaidOnlineRow) => {
      if (!token || !canAct) return;
      const n = whatsappChatNumber(row.customerPhone);
      if (!n) {
        toast.error(t('collections.whatsappNoPhone'));
        return;
      }
      setReminderBusyId(row.orderId);
      try {
        const res = await apiJson<SendPaymentLinkWhatsappResult>(
          `/api/call-center/orders/${row.orderId}/send-payment-link-whatsapp`,
          { method: 'POST', token },
        );

        if (!res.reminder.sent) {
          const minutesLeft =
            res.reminder.minutesUntilNext ??
            (res.reminder.hoursUntilNext != null ?
              res.reminder.hoursUntilNext * 60
            : 150);
          toast.warning(
            t('collections.remindCooldown', {
              minutes: minutesLeft,
            }),
          );
          await load({ silent: true });
          return;
        }

        if (res.serverPush) {
          toast.success(
            t('collections.remindSentServer', {
              count: res.reminder.reminderCount,
            }),
          );
          await load({ silent: true });
          return;
        }

        const paymentUrl = res.paymentUrl;
        setRows((prev) =>
          prev.map((r) =>
            r.orderId === row.orderId ? { ...r, paymentUrl } : r,
          ),
        );
        const text = buildCollectionsUnpaidWhatsAppText(
          { ...row, paymentUrl },
          paymentUrl,
        );
        const href = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
        window.open(href, '_blank', 'noopener,noreferrer');
        toast.info(t('collections.remindSentFallbackWa'));
        await load({ silent: true });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setReminderBusyId(null);
      }
    },
    [token, canAct, t, load],
  );

  /**
   * Same delivery as the primary WhatsApp action: ensure hosted URL, respect
   * reminder/cooldown, then open `wa.me` to the **customer** with the link —
   * never open the UPayments tab on the operator's browser.
   */
  const handlePaymentLink = useCallback(
    (row: CollectionUnpaidOnlineRow) => {
      return handleWhatsApp(row);
    },
    [handleWhatsApp],
  );

  /**
   * V1.6.9 — "تم الدفع" confirmation.
   *
   * The agent has just confirmed the customer paid outside the hosted
   * gateway (cash handed to the driver, KNET terminal, manual online,
   * or a link that was paid but the callback didn't land yet). We post
   * the chosen method and let the backend flip the order to COMPLETED +
   * PAID_TO_DRIVER atomically. The endpoint is idempotent so
   * double-clicks on a slow connection are safe.
   */
  const handleMarkPaid = useCallback(
    async (row: CollectionUnpaidOnlineRow, method: MarkPaidMethod) => {
      if (!token || !canAct) return;
      setMarkPaidBusy(method);
      try {
        const res = await apiJson<MarkOrderPaidResult>(
          `/api/call-center/orders/${row.orderId}/mark-paid`,
          {
            method: 'POST',
            token,
            body: JSON.stringify({ paymentMethod: method }),
          },
        );
        toast.success(
          res.alreadySettled
            ? t('collections.markPaidAlreadyToast')
            : t('collections.markPaidToast'),
        );
        setMarkPaidRow(null);
        await load({ silent: true });
        await loadSummary({ silent: true });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setMarkPaidBusy(null);
      }
    },
    [token, canAct, t, load, loadSummary],
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

  /** When search narrows the table to one customer's invoices — explain vs subscribers «effective» total */
  const singleCustomerInvoiceScope = useMemo(() => {
    if (filteredRows.length === 0) return null;
    const cid = filteredRows[0]?.customerId;
    if (!cid || filteredRows.some((r) => r.customerId !== cid)) return null;
    let total = 0;
    for (const r of filteredRows) {
      total += Number.parseFloat(r.amountKd || '0') || 0;
    }
    const first = filteredRows[0]!;
    const phone = first.customerPhone?.trim() ?? '';
    const name = first.customerName?.trim() ?? '';
    const qForLink =
      phone.length > 0 ? phone : name.length > 0 ? name : first.customerId;
    return {
      customerName: name || '—',
      invoiceTotalKd: total.toFixed(3),
      subscribersQuery: qForLink,
    };
  }, [filteredRows]);

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  // V1.6.5 — KPI cards and amount columns render with 3dp (fils).
  const kpiMarketDebt = summary ? formatKwd3(summary.totalMarketDebtKd) : '—';
  const kpiCollectedToday = summary
    ? formatKwd3(summary.debtCollectedTodayKd)
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

      {summary && !summaryLoading ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('collections.ledgerStripLine', {
            inv: formatKwd3(
              summary.outstandingInvoiceDebtKd ?? '0',
            ),
            sub: formatKwd3(
              summary.outstandingSubscriptionDebtKd ?? '0',
            ),
          })}
        </p>
      ) : null}

      {/*
       * V19.4 — CC pack #4. Daily collector feed. Lists today's debt-
       * reducing events across every agent with per-agent totals so a
       * supervisor / CC lead can answer "من حصّل ماذا اليوم؟" in one
       * glance, without leaving the Collections page.
       */}
      {user?.safariRole !== 'DRIVER' ? (
        <DailyCollectorPanel token={token} />
      ) : null}

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

      {singleCustomerInvoiceScope ?
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-start dark:border-sky-900/50 dark:bg-sky-950/30">
          <p className="text-sm leading-relaxed text-foreground">
            {t('collections.singleCustomerDebtAlignmentHint', {
              name: singleCustomerInvoiceScope.customerName,
              invoicesTotal: formatKwd3(
                singleCustomerInvoiceScope.invoiceTotalKd,
              ),
            })}
          </p>
          {canSubscribers ?
            <Link
              className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              to={`/subscribers?q=${encodeURIComponent(singleCustomerInvoiceScope.subscribersQuery)}`}
            >
              {t('collections.openSubscribersForTotal')}
            </Link>
          : null}
        </div>
      : null}

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
                className={cn(
                  'rounded-xl border p-4 shadow-sm transition-colors',
                  // V1.6.7 — full-row yellow wash for any order with a
                  // hosted payment link awaiting customer action. The
                  // signal is now at row-level (was a tiny pill before),
                  // so it's impossible to miss from across the room.
                  row.paymentUrl
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/30'
                    : 'border-border bg-card',
                )}
                title={
                  row.paymentUrl ? t('collections.pendingLinkHint') : undefined
                }
              >
                <p
                  className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground"
                  title={row.orderId}
                >
                  {row.readableId}
                </p>
                {/* V1.6.7 — the pending-link signal now lives at row
                    level (see the <li> className above), so the customer
                    name renders plain. Kept as a paragraph block for
                    spacing consistency. */}
                <p className="mt-1 font-semibold text-foreground">
                  {row.customerName}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">{row.customerPhone}</p>
                {row.branchName || row.driverName ?
                  <p className="text-xs text-muted-foreground">
                    {[row.branchName, row.driverName].filter(Boolean).join(' · ')}
                  </p>
                : null}
                <p className="mt-2 text-lg font-bold tabular-nums text-foreground">
                  {formatKwd3(row.amountKd)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {row.paymentMethod ? (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      {t(`collections.pm.${row.paymentMethod}`, {
                        defaultValue: row.paymentMethod,
                      })}
                    </span>
                  ) : null}
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
                {canAct ? (
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      type="button"
                      size="default"
                      className="min-h-12 flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={
                        reminderBusy || !canSendCollectionWaRow(row)
                      }
                      onClick={() => void handleWhatsApp(row)}
                      title={waSendButtonTitle(t, row, isCcAgent)}
                    >
                      {reminderBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      ) : (
                        <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
                      )}
                      {t('collections.whatsapp')}
                    </Button>
                    <Button
                      type="button"
                      size="default"
                      variant="outline"
                      className="min-h-12 flex-1 gap-2 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                      onClick={() => setMarkPaidRow(row)}
                      title={t('collections.markPaid')}
                    >
                      <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                      {t('collections.markPaid')}
                    </Button>
                  </div>
                ) : null}
                {canAct && canRecheckGatewayPayment(row) ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="default"
                      variant="secondary"
                      className="h-11 w-full gap-2"
                      disabled={
                        recheckingOrderId === row.orderId ||
                        reminderBusyId === row.orderId
                      }
                      title={t('collections.recheckHint')}
                      onClick={() => void handleGatewayRecheck(row.orderId)}
                    >
                      {recheckingOrderId === row.orderId ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      ) : (
                        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
                      )}
                      {t('collections.recheckPayment')}
                    </Button>
                  </div>
                ) : null}
                {canSubscribers ? (
                  <div className="mt-2">
                    <Link
                      to={
                        canSubscribersManage
                          ? `/subscribers?${new URLSearchParams({
                              activateCustomer: row.customerId,
                              n: row.customerName,
                              ...(row.customerPhone
                                ? { p: row.customerPhone }
                                : {}),
                            }).toString()}`
                          : `/subscribers?${new URLSearchParams(
                              row.customerPhone
                                ? { q: row.customerPhone }
                                : { q: row.customerName },
                            ).toString()}`
                      }
                      className="inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-3 text-sm font-medium text-indigo-900 hover:bg-indigo-100/90 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-100"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      {canSubscribersManage
                        ? t('collections.subscribersCta')
                        : t('collections.subscribersCtaView')}
                    </Link>
                  </div>
                ) : null}
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
              <TableHead>{t('collections.colPaymentMethod')}</TableHead>
              <TableHead className="text-end">
                {t('collections.colAmount')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('collections.colDaysElapsed')}
              </TableHead>
              <TableHead className="text-end tabular-nums">
                {t('collections.colReminders')}
              </TableHead>
              {canSubscribers ? (
                <TableHead className="w-[100px] text-center text-xs">
                  {t('collections.colSubscription')}
                </TableHead>
              ) : null}
              {canAct ? (
                <TableHead className="min-w-[280px] max-w-[420px] text-center">
                  {t('collections.colActions')}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={tableColCount}
                  className="py-12 text-center"
                >
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            : null}
            {!loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={tableColCount}
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
                // V1.6.7 — full row highlighted amber when a hosted
                // payment link is awaiting customer action. Replaces
                // the earlier pill-only indicator so the operator
                // instantly sees which invoices have live links out.
                <TableRow
                  key={row.orderId}
                  className={cn(
                    row.paymentUrl &&
                      'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
                  )}
                  title={
                    row.paymentUrl ? t('collections.pendingLinkHint') : undefined
                  }
                >
                  <TableCell
                    className="font-mono text-xs font-medium tabular-nums"
                    title={row.orderId}
                  >
                    {row.readableId}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    <div>{row.customerName}</div>
                    {row.branchName || row.driverName ?
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                        {[row.branchName, row.driverName].filter(Boolean).join(' · ')}
                      </div>
                    : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.customerPhone}</TableCell>
                  <TableCell>
                    {row.paymentMethod ? (
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t(`collections.pm.${row.paymentMethod}`, {
                          defaultValue: row.paymentMethod,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-semibold">
                    {formatKwd3(row.amountKd)}
                  </TableCell>
                  <TableCell
                    className={cn('text-end tabular-nums font-medium', ageTone)}
                  >
                    {row.invoiceAgeDays}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.reminderCount}
                  </TableCell>
                  {canSubscribers ? (
                    <TableCell className="p-1 text-center">
                      <Link
                        to={
                          canSubscribersManage
                            ? `/subscribers?${new URLSearchParams({
                                activateCustomer: row.customerId,
                                n: row.customerName,
                                ...(row.customerPhone
                                  ? { p: row.customerPhone }
                                  : {}),
                              }).toString()}`
                            : `/subscribers?${new URLSearchParams(
                                row.customerPhone
                                  ? { q: row.customerPhone }
                                  : { q: row.customerName },
                              ).toString()}`
                        }
                        className="inline-flex h-8 w-full min-w-0 max-w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-1.5 text-[10px] font-medium text-foreground transition hover:border-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30"
                        title={t('collections.subscribersCtaTitle')}
                      >
                        <Sparkles
                          className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400"
                          aria-hidden
                        />
                        <span className="truncate">
                          {canSubscribersManage
                            ? t('collections.subscribersCta')
                            : t('collections.subscribersCtaView')}
                        </span>
                      </Link>
                    </TableCell>
                  ) : null}
                  {canAct ? (
                    <TableCell className="text-center">
                      <div className="inline-flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-9 min-w-[7rem] gap-1.5 sm:min-w-[120px]"
                          disabled={
                            reminderBusy || !canSendCollectionWaRow(row)
                          }
                          onClick={() => void handleWhatsApp(row)}
                          title={waSendButtonTitle(t, row, isCcAgent)}
                        >
                          {reminderBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <MessageCircle className="h-4 w-4" aria-hidden />
                          )}
                          {t('collections.whatsapp')}
                        </Button>
                        {canRecheckGatewayPayment(row) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="min-h-9 gap-1.5"
                            disabled={
                              recheckingOrderId === row.orderId || reminderBusy
                            }
                            title={t('collections.recheckHint')}
                            onClick={() => void handleGatewayRecheck(row.orderId)}
                          >
                            {recheckingOrderId === row.orderId ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <ShieldCheck className="h-4 w-4" aria-hidden />
                            )}
                            {t('collections.recheckPayment')}
                          </Button>
                        ) : null}
                        {/* V1.6.9 — "تم الدفع" confirmation. */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-9 gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                          onClick={() => setMarkPaidRow(row)}
                          title={t('collections.markPaid')}
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          {t('collections.markPaid')}
                        </Button>
                        {/* V1.6.7 — KNET / Manual-Settlement button
                            hidden in favor of the unified WhatsApp Send-
                            Link flow. See mobile block for rationale. */}
                        {false && (
                          <button
                            type="button"
                            disabled={reminderBusy}
                            onClick={() => void handlePaymentLink(row)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                            title={t('collections.paymentLink')}
                            aria-label={t('collections.paymentLink')}
                          >
                            {reminderBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <CreditCard className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {filteredRows.length > 0 ? (
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={4} className="text-end">
                  {t('collections.totalFooter')}
                </TableCell>
                {/* V1.6.5 — 3dp footer sum. Reducing in JS number space
                    is safe for display (< 1e15 KWD) and the KWD-3 helper
                    rounds half-to-even at the last fils so the footer
                    equals the Red-card KPI under the same branch scope. */}
                <TableCell className="text-end tabular-nums">
                  {formatKwd3(
                    filteredRows.reduce(
                      (acc, r) => acc + (Number.parseFloat(r.amountKd) || 0),
                      0,
                    ),
                  )}
                </TableCell>
                <TableCell
                  colSpan={
                    2 + (canSubscribers ? 1 : 0) + (canAct ? 1 : 0)
                  }
                />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/*
        V1.6.9 — "تم الدفع" payment-method picker.

        Opens when the agent clicks the green check button on any row.
        Presents four large tap-friendly cards so a phone-first operator
        can confirm the collection in one finger-touch without ambiguity.
        The `open` state is derived from `markPaidRow` so closing the
        dialog just clears the selected row (no orphaned state).
      */}
      <Dialog
        open={markPaidRow !== null}
        onOpenChange={(open) => {
          if (!open) setMarkPaidRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('collections.markPaidTitle')}</DialogTitle>
            <DialogDescription>
              {markPaidRow ? (
                <>
                  {t('collections.markPaidSubtitle')}
                  <br />
                  <span className="mt-1 block text-foreground">
                    <span className="font-medium">
                      {markPaidRow.customerName}
                    </span>
                    {' — '}
                    <span className="font-semibold tabular-nums">
                      {formatKwd3(markPaidRow.amountKd)}
                    </span>
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  key: 'CASH',
                  icon: <Banknote className="h-6 w-6" aria-hidden />,
                },
                {
                  key: 'KNET',
                  icon: <CreditCard className="h-6 w-6" aria-hidden />,
                },
                {
                  key: 'PAYMENT_LINK',
                  icon: <Link2 className="h-6 w-6" aria-hidden />,
                },
                {
                  key: 'ONLINE',
                  icon: <Globe className="h-6 w-6" aria-hidden />,
                },
              ] as const
            ).map(({ key, icon }) => {
              const busy = markPaidBusy === key;
              const disabled = markPaidBusy !== null;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    markPaidRow && void handleMarkPaid(markPaidRow, key)
                  }
                  className={cn(
                    'group relative flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-card p-3 text-sm font-medium text-foreground shadow-sm transition-colors',
                    'hover:border-emerald-400 hover:bg-emerald-50 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    busy &&
                      'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors',
                      'group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:group-hover:bg-emerald-900/60 dark:group-hover:text-emerald-200',
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      icon
                    )}
                  </span>
                  <span>
                    {t(`collections.pm.${key}`, { defaultValue: key })}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
