import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  Bell,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/modules/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
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
import { useAuth } from '@/contexts/auth-context';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  type CallCenterPlan,
  type CustomerSearchRow,
  type ReminderResult,
  type SubscriberListRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * Dastur §5 (V1.5) — Hard safety countdown for destructive / cost-bearing
 * actions. The user cannot confirm until this hits 0.
 */
const RENEW_CONFIRM_SECONDS = 10;

const POLL_MS = 12_000;

function rowTone(status: SubscriberListRow['rowStatus']): string {
  switch (status) {
    case 'expired':
      return 'border-s-4 border-slate-400 bg-slate-100/90 text-muted-foreground dark:bg-slate-900/40';
    case 'active_warn':
      return 'border-s-4 border-red-600 bg-red-50/90 text-foreground dark:bg-red-950/40 dark:text-red-50';
    case 'active_ok':
    case 'open_credit':
      return 'border-s-4 border-emerald-600 bg-emerald-50/80 text-foreground dark:bg-emerald-950/35 dark:text-emerald-50';
    default:
      return '';
  }
}

function isCriticalBalance(balance: string): boolean {
  const n = Number.parseFloat(balance);
  return Number.isFinite(n) && n < 10;
}

/** Digits-only phone normalisation — matches the collections page helper. */
function normalisePhone(value: string): string {
  return value.replace(/\D+/g, '');
}

function SubscriberCard({
  r,
  formatDate,
  canAct,
  onRemind,
  onRenew,
  reminderBusy,
}: {
  r: SubscriberListRow;
  formatDate: (iso: string | null) => string;
  canAct: boolean;
  onRemind: (r: SubscriberListRow) => void;
  onRenew: (r: SubscriberListRow) => void;
  reminderBusy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        'rounded-xl border border-border/60 p-4 shadow-sm',
        rowTone(r.rowStatus),
      )}
    >
      <p className="font-semibold text-foreground">{r.customerName}</p>
      <p className="mt-1 text-sm text-muted-foreground">{r.subscriptionType}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2 text-xs sm:text-sm">
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colStart')}</dt>
          <dd className="tabular-nums font-medium">{formatDate(r.startDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colExpiry')}</dt>
          <dd className="tabular-nums font-medium">{formatDate(r.expiryDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colRemaining')}</dt>
          <dd className="tabular-nums font-medium">
            {r.remainingDays === null ? '—' : r.remainingDays}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colDaysElapsed')}</dt>
          <dd className="tabular-nums font-medium">
            {r.invoiceAgeDays === null ? '—' : r.invoiceAgeDays}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colReminders')}</dt>
          <dd className="tabular-nums font-medium">{r.reminderCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('subscribers.colBalance')}</dt>
          <dd
            className={cn(
              'tabular-nums font-semibold',
              isCriticalBalance(r.balance) && 'text-red-700',
            )}
          >
            {formatKwdLabel(r.balance)}
          </dd>
          {isCriticalBalance(r.balance) ? (
            <div className="col-span-2 text-xs font-semibold text-red-700">
              {t('subscribers.lowBalanceWarn')}
            </div>
          ) : null}
        </div>
      </dl>
      {canAct ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={reminderBusy || !r.canRemindNow}
            onClick={() => onRemind(r)}
            aria-label={t('subscribers.remindCta')}
          >
            <Bell className="h-4 w-4" aria-hidden />
            {t('subscribers.remindCta')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1"
            disabled={!r.planId}
            onClick={() => onRenew(r)}
            aria-label={t('subscribers.renewCta')}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('subscribers.renewCta')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Dastur §5 (V1.5) — Renew confirmation with a hard 10-second countdown.
 *
 * The approve button is DISABLED until the timer hits 0. Users cannot
 * bypass with keyboard focus, rapid clicks, or dialog remounts (the
 * timer state belongs to this component, which remounts with the
 * `key={customerId}` on the parent). Closing the dialog aborts.
 */
function RenewConfirmDialog({
  subscriber,
  open,
  onOpenChange,
  token,
  onRenewed,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  onRenewed: () => void;
}) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState<number>(RENEW_CONFIRM_SECONDS);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setRemaining(RENEW_CONFIRM_SECONDS);
      setSubmitting(false);
      return;
    }
    setRemaining(RENEW_CONFIRM_SECONDS);
    const id = window.setInterval(() => {
      setRemaining((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, subscriber?.customerId]);

  const confirmDisabled = remaining > 0 || submitting || !subscriber?.planId;

  async function confirm() {
    if (confirmDisabled || !subscriber?.planId) return;
    setSubmitting(true);
    try {
      await apiJson('/api/call-center/subscriptions/activate', {
        method: 'POST',
        token,
        body: JSON.stringify({
          customerId: subscriber.customerId,
          planId: subscriber.planId,
        }),
      });
      toast.success(t('subscribers.renewSuccess'));
      onRenewed();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" aria-hidden />
            {t('subscribers.renewDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.renewDialogDescription', {
              name: subscriber?.customerName ?? '',
              plan: subscriber?.subscriptionType ?? '—',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            {t('subscribers.renewWait', { seconds: remaining })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('subscribers.renewWaitHint')}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('subscribers.renewCancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={confirmDisabled}
          >
            {submitting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="me-2 h-4 w-4" aria-hidden />
            )}
            {remaining > 0
              ? t('subscribers.renewConfirmCountdown', { seconds: remaining })
              : t('subscribers.renewConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dastur §5 — Issue-subscription dialog for Call Center operators.
 * Uses the existing `/api/call-center/*` endpoints; no new backend surface.
 */
function IssueSubscriptionDialog({
  open,
  onOpenChange,
  token,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  onIssued: () => void;
}) {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<CallCenterPlan[] | null>(null);
  const [planId, setPlanId] = useState<string>('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearchRow[]>(
    [],
  );
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const rows = await apiJson<CallCenterPlan[]>(
          '/api/call-center/subscription-plans',
          { token },
        );
        if (!alive) return;
        setPlans(rows);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    const q = customerQuery.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    let alive = true;
    setCustomerSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await apiJson<CustomerSearchRow[]>(
          `/api/call-center/customers?q=${encodeURIComponent(q)}`,
          { token },
        );
        if (!alive) return;
        setCustomerResults(rows);
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (alive) setCustomerSearching(false);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [customerQuery, open, token]);

  // Reset state whenever the dialog reopens — avoids leaking previous picks.
  useEffect(() => {
    if (!open) {
      setPlanId('');
      setCustomerQuery('');
      setCustomerResults([]);
      setSelectedCustomer(null);
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = Boolean(planId && selectedCustomer && !submitting);

  async function submit() {
    if (!canSubmit || !selectedCustomer) return;
    setSubmitting(true);
    try {
      await apiJson('/api/call-center/subscriptions/activate', {
        method: 'POST',
        token,
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          planId,
        }),
      });
      toast.success(t('subscribers.issueSuccess'));
      onIssued();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            {t('subscribers.issueDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.issueDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-customer">
              {t('subscribers.issueCustomerLabel')}
            </Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {selectedCustomer.displayName || selectedCustomer.phone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedCustomer.phone}
                    {selectedCustomer.address
                      ? ` · ${selectedCustomer.address}`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCustomer(null)}
                >
                  {t('subscribers.issueChangeCustomer')}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="sub-customer"
                    type="search"
                    inputMode="tel"
                    placeholder={t('subscribers.issueCustomerPlaceholder')}
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    className="ps-9"
                  />
                </div>
                {customerSearching ? (
                  <p className="text-xs text-muted-foreground">
                    {t('subscribers.issueSearching')}
                  </p>
                ) : customerQuery.trim().length >= 2 &&
                  customerResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('subscribers.issueNoMatches')}
                  </p>
                ) : customerResults.length > 0 ? (
                  <ul className="max-h-40 divide-y overflow-y-auto rounded-md border border-border">
                    {customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-accent"
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {c.displayName || c.phone}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.phone}
                              {c.address ? ` · ${c.address}` : ''}
                            </span>
                          </span>
                          {c.wallet ? (
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {t('subscribers.issueDebtShort', {
                                amount: formatKwdLabel(c.wallet.debt),
                              })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-plan">{t('subscribers.issuePlanLabel')}</Label>
            <Select
              value={planId}
              onValueChange={(v) => setPlanId(v ?? '')}
            >
              <SelectTrigger id="sub-plan">
                <SelectValue
                  placeholder={t('subscribers.issuePlanPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {(plans ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatKwdLabel(p.salePrice)} →{' '}
                    {formatKwdLabel(p.actualBalance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t('subscribers.issuePlanHint')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('subscribers.issueCancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="me-2 h-4 w-4" aria-hidden />
            )}
            {t('subscribers.issueSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubscribersPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, hasRole } = useAuth();
  const allowed = hasRole('OWNER', 'CALL_CENTER');
  const canIssue = hasRole('CALL_CENTER', 'OWNER');

  const [rows, setRows] = useState<SubscriberListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<SubscriberListRow | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reminderBusyId, setReminderBusyId] = useState<string | null>(null);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [locale],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !allowed) return;
      if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const data = await apiJson<SubscriberListRow[]>('/api/subscribers', {
          token,
        });
        setRows(data);
      } catch (e) {
        if (e instanceof ApiError) {
          toast.error(e.message);
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [token, allowed],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !allowed) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token, allowed, load]);

  /**
   * Dastur §5 (V1.5) — fire a 24h-guarded reminder. Backend enforces the
   * cooldown atomically; we just surface the outcome and refresh.
   */
  const handleRemind = useCallback(
    async (r: SubscriberListRow) => {
      if (!token) return;
      setReminderBusyId(r.customerId);
      try {
        const res = await apiJson<ReminderResult>(
          `/api/call-center/subscribers/${r.customerId}/reminder`,
          { method: 'POST', token },
        );
        if (res.sent) {
          toast.success(
            t('subscribers.remindSentToast', { count: res.reminderCount }),
          );
        } else {
          toast.warning(
            t('subscribers.remindCooldown', {
              hours: res.hoursUntilNext ?? 24,
            }),
          );
        }
        await load({ silent: true });
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        setReminderBusyId(null);
      }
    },
    [token, t, load],
  );

  const handleOpenRenew = useCallback((r: SubscriberListRow) => {
    if (!r.planId) return;
    setRenewTarget(r);
    setRenewOpen(true);
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const q = query.trim();
    if (!q) return rows;
    const digits = normalisePhone(q);
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      if (r.customerName?.toLowerCase().includes(needle)) return true;
      if (r.subscriptionType?.toLowerCase().includes(needle)) return true;
      // `SubscriberListRow` doesn't expose the phone directly today, so we
      // compare the digit-normalised name too — covers phone-in-name cases
      // the backend sometimes uses for legacy customers.
      if (digits && normalisePhone(r.customerName ?? '').includes(digits)) {
        return true;
      }
      return false;
    });
  }, [rows, query]);

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return dateFmt.format(d);
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {t('subscribers.title')}
          </h1>
          <p className="text-sm text-zinc-500">{t('subscribers.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canIssue && token ? (
            <Button
              type="button"
              size="default"
              className="h-11 min-h-11 gap-2"
              onClick={() => setIssueOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('subscribers.issueCta')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="default"
            className="h-11 min-h-11 w-full touch-manipulation gap-2 sm:w-auto"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={cn('h-4 w-4', loading && 'animate-spin')}
              aria-hidden
            />
            {t('subscribers.refresh')}
          </Button>
        </div>
      </header>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          inputMode="tel"
          placeholder={t('subscribers.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ps-9"
        />
      </div>

      <section className="md:hidden">
        {filteredRows === null ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {loading ? t('subscribers.loading') : t('subscribers.unable')}
          </p>
        : filteredRows.length === 0 ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {query.trim() ? t('subscribers.emptySearch') : t('subscribers.empty')}
          </p>
        : <ul className="space-y-3">
            {filteredRows.map((r) => (
              <li key={r.customerId}>
                <SubscriberCard
                  r={r}
                  formatDate={formatDate}
                  canAct={canIssue}
                  onRemind={(row) => void handleRemind(row)}
                  onRenew={handleOpenRenew}
                  reminderBusy={reminderBusyId === r.customerId}
                />
              </li>
            ))}
          </ul>
        }
      </section>

      <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-border dark:bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colCustomer')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colPlan')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colStart')}
              </TableHead>
              <TableHead className="whitespace-nowrap">
                {t('subscribers.colExpiry')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colRemaining')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colDaysElapsed')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colReminders')}
              </TableHead>
              <TableHead className="whitespace-nowrap text-end tabular-nums">
                {t('subscribers.colBalance')}
              </TableHead>
              {canIssue ? (
                <TableHead className="whitespace-nowrap text-end">
                  {t('subscribers.colActions')}
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows === null ?
              <TableRow>
                <TableCell
                  colSpan={canIssue ? 9 : 8}
                  className="text-center text-sm text-muted-foreground"
                >
                  {loading ? t('subscribers.loading') : t('subscribers.unable')}
                </TableCell>
              </TableRow>
            : filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={canIssue ? 9 : 8}
                  className="text-center text-sm text-muted-foreground"
                >
                  {query.trim() ? t('subscribers.emptySearch') : t('subscribers.empty')}
                </TableCell>
              </TableRow>
            : filteredRows.map((r) => (
                <TableRow
                  key={r.customerId}
                  className={cn(rowTone(r.rowStatus), 'align-middle')}
                >
                  <TableCell className="max-w-[10rem] font-medium">
                    {r.customerName}
                  </TableCell>
                  <TableCell className="max-w-[8rem] text-sm">
                    {r.subscriptionType}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {formatDate(r.startDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {formatDate(r.expiryDate)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm">
                    {r.remainingDays === null ? '—' : r.remainingDays}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm">
                    {r.invoiceAgeDays === null ? '—' : r.invoiceAgeDays}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-sm">
                    {r.reminderCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-end tabular-nums text-sm font-medium',
                      isCriticalBalance(r.balance) && 'text-red-700',
                    )}
                  >
                    {formatKwdLabel(r.balance)}
                  </TableCell>
                  {canIssue ? (
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={
                            reminderBusyId === r.customerId || !r.canRemindNow
                          }
                          onClick={() => void handleRemind(r)}
                          aria-label={t('subscribers.remindCta')}
                          title={
                            r.canRemindNow
                              ? t('subscribers.remindCta')
                              : t('subscribers.remindCooldownShort')
                          }
                        >
                          {reminderBusyId === r.customerId ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Bell className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1"
                          disabled={!r.planId}
                          onClick={() => handleOpenRenew(r)}
                          aria-label={t('subscribers.renewCta')}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden />
                          {t('subscribers.renewCta')}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {canIssue && token ? (
        <IssueSubscriptionDialog
          open={issueOpen}
          onOpenChange={setIssueOpen}
          token={token}
          onIssued={() => void load()}
        />
      ) : null}

      {canIssue && token ? (
        <RenewConfirmDialog
          key={renewTarget?.customerId ?? 'renew-idle'}
          subscriber={renewTarget}
          open={renewOpen}
          onOpenChange={(n) => {
            setRenewOpen(n);
            if (!n) setRenewTarget(null);
          }}
          token={token}
          onRenewed={() => void load()}
        />
      ) : null}
    </div>
  );
}
