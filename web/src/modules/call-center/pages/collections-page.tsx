import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
import { cn } from '@/lib/utils';

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
  return `${raw.toLocaleString('en-KW', {
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
  // V1.6.0 — Page access is limited to OWNER (oversight) and CALL_CENTER
  // (workspace). MANAGER, DRIVER, ACCOUNTANT, and VIEWER do not see this
  // page at all. Within the two permitted roles, only CALL_CENTER can
  // actually send WhatsApp reminders or open a hosted payment link —
  // OWNER sees the page as a read-only Financial Oversight Report.
  const allowed = can(user, 'collections.view');
  const canAct = can(user, 'collections.act');
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
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  // V1.6.9 — "تم الدفع" manual confirmation flow. We keep the row that
  // the agent picked so the dialog shows the customer name + amount, and
  // we track which method is currently submitting so the picked button
  // shows a spinner while the others stay enabled for correction.
  const [markPaidRow, setMarkPaidRow] = useState<CollectionUnpaidOnlineRow | null>(
    null,
  );
  const [markPaidBusy, setMarkPaidBusy] = useState<MarkPaidMethod | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setLoading(true);
      try {
        // V1.6.5 — forward the Owner's branch filter to the table so
        // the footer sum equals the Red KPI card to the last fils. For
        // CALL_CENTER the switcher isn't rendered → `ownerBranchId` is
        // always null and the fetch stays global.
        const qs = ownerBranchId
          ? `?branchId=${encodeURIComponent(ownerBranchId)}`
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
    [token, allowed, ownerBranchId],
  );

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) setSummaryLoading(true);
      try {
        // V1.6.1 — obey the top-right "Branch" dropdown. Only OWNER has
        // the switcher rendered (`BranchSwitcher`); for CALL_CENTER
        // `ownerBranchId` is always null and the aggregate stays global.
        const qs = ownerBranchId
          ? `?branchId=${encodeURIComponent(ownerBranchId)}`
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
    [token, allowed, ownerBranchId],
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
   * Dastur V1.5.2 + V1.6.6 — "Send Payment Link" WhatsApp flow.
   *
   * Sequence:
   *   1. Ensure the order has a hosted payment URL — mint one on the
   *      fly if `row.paymentUrl` is null so the template always carries
   *      a live link.
   *   2. Atomically increment the 24h server-side reminder counter. If
   *      the cooldown hasn't elapsed, toast the cooldown message and
   *      abort without opening WhatsApp.
   *   3. Render the Arabic invoice + T&Cs template (see
   *      `buildCollectionsUnpaidWhatsAppText`) and open wa.me with it
   *      pre-filled.
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
        // 1. Make sure we have a payment URL before we compose the
        //    message. We only hit the endpoint when we don't already
        //    have one so we don't churn the gateway needlessly. On
        //    success we optimistically patch local state so the row
        //    turns yellow INSTANTLY — the silent reload at the end of
        //    this handler will reconcile with the server.
        let paymentUrl = row.paymentUrl;
        if (!paymentUrl) {
          try {
            const linkRes = await apiJson<{ url: string }>(
              `/api/call-center/orders/${row.orderId}/payment-link`,
              { method: 'POST', token },
            );
            paymentUrl = linkRes?.url ?? null;
            if (paymentUrl) {
              const freshUrl = paymentUrl;
              setRows((prev) =>
                prev.map((r) =>
                  r.orderId === row.orderId ? { ...r, paymentUrl: freshUrl } : r,
                ),
              );
            }
          } catch (e) {
            if (e instanceof ApiError) toast.error(e.message);
            return;
          }
        }

        // 2. Reminder counter / 2.5h cooldown (V1.6.8 — Owner recall window).
        const res = await apiJson<ReminderResult>(
          `/api/call-center/orders/${row.orderId}/reminder`,
          { method: 'POST', token },
        );
        if (!res.sent) {
          // Prefer minute-resolution (new server field); fall back to
          // hours*60 for any stale build, and finally to the 150-minute
          // window ceiling so the toast always renders something sane.
          const minutesLeft =
            res.minutesUntilNext ??
            (res.hoursUntilNext != null ? res.hoursUntilNext * 60 : 150);
          toast.warning(
            t('collections.remindCooldown', {
              minutes: minutesLeft,
            }),
          );
          await load({ silent: true });
          return;
        }

        // 3. Compose + open.
        const text = buildCollectionsUnpaidWhatsAppText(row, paymentUrl);
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
    [token, canAct, t, load],
  );

  /**
   * V1.6.0 — on-demand payment link. Works for ANY unpaid order regardless
   * of the original method. If the backend already has a `posHostedPaymentUrl`
   * it's returned immediately; otherwise a fresh link is minted and persisted.
   * The order keeps its original `posPaymentMethod` until the gateway
   * callback lands — at that point the order auto-switches to ONLINE and
   * the ledger row is tagged as a debt settlement.
   */
  const handlePaymentLink = useCallback(
    async (row: CollectionUnpaidOnlineRow) => {
      if (!token || !canAct) return;
      // Fast path: existing link → just open it.
      if (row.paymentUrl) {
        window.open(row.paymentUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      setLinkBusyId(row.orderId);
      try {
        const res = await apiJson<{ url: string }>(
          `/api/call-center/orders/${row.orderId}/payment-link`,
          { method: 'POST', token },
        );
        if (res?.url) {
          window.open(res.url, '_blank', 'noopener,noreferrer');
          // Refresh so subsequent clicks use the cached URL from the server.
          await load({ silent: true });
        }
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setLinkBusyId(null);
      }
    },
    [token, canAct, load],
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
            const linkBusy = linkBusyId === row.orderId;
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
                    {/* V1.6.9 — "تم الدفع" confirmation.
                        Opens the payment-method picker dialog so the agent
                        can record CASH / KNET / PAYMENT_LINK / ONLINE. */}
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
                    {/*
                      V1.6.7 — The standalone "Knet / Manual-Settlement"
                      open-hosted-URL button is temporarily hidden. The
                      WhatsApp "Send Link" button above now performs the
                      complete flow (mint → increment reminder → send
                      template with embedded link), so a separate KNET
                      launcher would double-count reminders. Flip the
                      feature flag below to re-enable; `handlePaymentLink`
                      and `linkBusy` remain live so re-exposing the
                      button is a one-line change.
                    */}
                    {false && (
                      <button
                        type="button"
                        disabled={linkBusy}
                        onClick={() => void handlePaymentLink(row)}
                        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                        title={t('collections.paymentLink')}
                        aria-label={t('collections.paymentLink')}
                      >
                        {linkBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        ) : (
                          <CreditCard className="h-5 w-5" aria-hidden />
                        )}
                      </button>
                    )}
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
              {canAct ? (
                <TableHead className="w-[260px] text-center">
                  {t('collections.colActions')}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell colSpan={canAct ? 8 : 7} className="py-12 text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            : null}
            {!loading && filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={canAct ? 8 : 7}
                  className="py-10 text-center text-muted-foreground"
                >
                  {query.trim() ? t('collections.emptySearch') : t('collections.empty')}
                </TableCell>
              </TableRow>
            : null}
            {filteredRows.map((row) => {
              const reminderBusy = reminderBusyId === row.orderId;
              const linkBusy = linkBusyId === row.orderId;
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
                    {row.customerName}
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
                  {canAct ? (
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
                            disabled={linkBusy}
                            onClick={() => void handlePaymentLink(row)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                            title={t('collections.paymentLink')}
                            aria-label={t('collections.paymentLink')}
                          >
                            {linkBusy ? (
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
                <TableCell colSpan={canAct ? 3 : 2} />
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
