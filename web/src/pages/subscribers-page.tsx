import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  Loader2,
  Plus,
  RefreshCw,
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
import { can } from '@/modules/shared/auth/access-matrix';
import { useAppLocale } from '@/modules/shared/hooks/use-app-locale';
import {
  type CallCenterPlan,
  type CustomerSearchRow,
  type ExtendSubscriptionResult,
  type SubscriberListRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel } from '@/lib/kwd';

const POLL_MS = 12_000;

/**
 * Dastur V1.5.3 — Activate-dialog modes.
 *
 * - `new`     → blank flow, from the header "إضافة اشتراك" icon.
 * - `upgrade` → customer pre-selected, plan cleared so the agent must pick
 *               a different tier.
 *
 * "Extend" is no longer an activate-dialog mode: it has its own dedicated
 * dialog that only takes a day-count and never touches the wallet.
 */
type IssueMode = 'new' | 'upgrade';

/** Upper bound matches the backend DTO guardrail. */
const EXTEND_MAX_DAYS = 365;
const EXTEND_MIN_DAYS = 1;

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

type IssuePrefill = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  /** Only set for `extend`; cleared for `upgrade`. */
  planId: string | null;
};

function SubscriberCard({
  r,
  formatDate,
  canManage,
  onOpenAccount,
}: {
  r: SubscriberListRow;
  formatDate: (iso: string | null) => string;
  canManage: boolean;
  onOpenAccount: (r: SubscriberListRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        'rounded-xl border border-border/60 p-4 shadow-sm',
        rowTone(r.rowStatus),
      )}
    >
      {canManage ? (
        <button
          type="button"
          onClick={() => onOpenAccount(r)}
          className="text-start font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {r.customerName}
        </button>
      ) : (
        <p className="font-semibold text-foreground">{r.customerName}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{r.subscriptionType}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4 sm:text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t('subscribers.colBalance')}</dt>
          <dd
            className={cn(
              'tabular-nums text-base font-bold text-foreground sm:text-sm',
              isCriticalBalance(r.balance) && 'text-red-700',
            )}
          >
            {formatKwdLabel(r.balance)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t('subscribers.colExpiry')}</dt>
          <dd className="tabular-nums font-semibold text-foreground">
            {formatDate(r.expiryDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t('subscribers.colStart')}</dt>
          <dd className="tabular-nums font-medium">{formatDate(r.startDate)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t('subscribers.colRemaining')}</dt>
          <dd className="tabular-nums font-medium">
            {r.remainingDays === null ? '—' : r.remainingDays}
          </dd>
        </div>
      </dl>
      {isCriticalBalance(r.balance) ? (
        <p className="mt-2 text-xs font-semibold text-red-700">
          {t('subscribers.lowBalanceWarn')}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Dastur V1.5.2 — Account management launcher.
 *
 * When an operator clicks the customer name in the Management Room, they
 * are NOT collecting debt — they're managing the account. This dialog
 * presents the two distinct management actions the owner defined:
 *
 *  - Extend Subscription (تمديد): another cycle on the SAME plan.
 *  - Upgrade Subscription (ترقية): move the customer to a DIFFERENT plan.
 *
 * Both routes open the existing subscription activation dialog with the
 * customer pre-selected, so there is zero new backend surface.
 */
function ManageAccountDialog({
  subscriber,
  open,
  onOpenChange,
  onExtend,
  onUpgrade,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onExtend: (r: SubscriberListRow) => void;
  onUpgrade: (r: SubscriberListRow) => void;
}) {
  const { t } = useTranslation();
  const canExtend = Boolean(subscriber?.planId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            {t('subscribers.manageDialogTitle', {
              name: subscriber?.customerName ?? '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.manageDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <button
            type="button"
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-start transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canExtend || !subscriber}
            onClick={() => subscriber && onExtend(subscriber)}
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {t('subscribers.manageExtendTitle')}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {canExtend
                  ? t('subscribers.manageExtendHint', {
                      plan: subscriber?.subscriptionType ?? '—',
                    })
                  : t('subscribers.manageExtendDisabled')}
              </span>
            </span>
          </button>

          <button
            type="button"
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-start transition hover:border-primary hover:bg-primary/5"
            onClick={() => subscriber && onUpgrade(subscriber)}
          >
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
              <ArrowUpRight className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {t('subscribers.manageUpgradeTitle')}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t('subscribers.manageUpgradeHint')}
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('subscribers.manageClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dastur §5 — Issue-subscription dialog for Call Center operators.
 * V1.5.2 — now reusable for Extend / Upgrade (with customer pre-selected).
 *
 * Uses the existing `/api/call-center/*` endpoints; no new backend surface.
 */
function IssueSubscriptionDialog({
  open,
  onOpenChange,
  token,
  mode,
  prefill,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  mode: IssueMode;
  prefill: IssuePrefill | null;
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

  // Pre-fill customer + plan from the caller when the dialog opens in
  // extend/upgrade mode. Runs once per open so that the user can still
  // clear/replace the customer manually if they change their mind.
  useEffect(() => {
    if (!open) {
      setPlanId('');
      setCustomerQuery('');
      setCustomerResults([]);
      setSelectedCustomer(null);
      setSubmitting(false);
      return;
    }
    if (prefill) {
      // Synthesize a minimal CustomerSearchRow shape from the subscriber row
      // so the dialog shows the locked-in customer card without refetching.
      const synthetic: CustomerSearchRow = {
        id: prefill.customerId,
        phone: prefill.customerPhone ?? '',
        displayName: prefill.customerName,
        address: null,
        createdAt: new Date().toISOString(),
        wallet: null,
      };
      setSelectedCustomer(synthetic);
      setPlanId(prefill.planId ?? '');
    }
  }, [open, prefill]);

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
      toast.success(
        mode === 'upgrade'
          ? t('subscribers.upgradeSuccess')
          : t('subscribers.issueSuccess'),
      );
      onIssued();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    mode === 'upgrade'
      ? t('subscribers.upgradeDialogTitle')
      : t('subscribers.issueDialogTitle');
  const description =
    mode === 'upgrade'
      ? t('subscribers.upgradeDialogDescription')
      : t('subscribers.issueDialogDescription');
  const submitLabel =
    mode === 'upgrade'
      ? t('subscribers.upgradeSubmit')
      : t('subscribers.issueSubmit');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'upgrade' ? (
              <ArrowUpRight className="h-5 w-5 text-amber-600" aria-hidden />
            ) : (
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
              {mode === 'upgrade'
                ? t('subscribers.upgradePlanHint')
                : t('subscribers.issuePlanHint')}
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
            ) : mode === 'upgrade' ? (
              <ArrowUpRight className="me-2 h-4 w-4" aria-hidden />
            ) : (
              <Sparkles className="me-2 h-4 w-4" aria-hidden />
            )}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dastur V1.5.3 — Dedicated "Extend Subscription" (تمديد) dialog.
 *
 * No wallet movement, no plan picker. The operator only chooses a day
 * count (1..365) to push the existing `subscriptionExpiresAt` forward.
 * The plan is shown read-only so it's clear which plan is being extended.
 */
function ExtendSubscriptionDialog({
  subscriber,
  open,
  onOpenChange,
  token,
  onExtended,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  onExtended: () => void;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<string>('30');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDays('30');
      setSubmitting(false);
    }
  }, [open, subscriber?.customerId]);

  const parsed = Number.parseInt(days, 10);
  const validDays =
    Number.isInteger(parsed) &&
    parsed >= EXTEND_MIN_DAYS &&
    parsed <= EXTEND_MAX_DAYS;
  const canSubmit = Boolean(subscriber && validDays && !submitting);

  const planLabel =
    subscriber?.subscriptionType && subscriber.subscriptionType.trim().length > 0
      ? subscriber.subscriptionType
      : t('subscribers.extendPlanUnknown');

  async function submit() {
    if (!canSubmit || !subscriber) return;
    setSubmitting(true);
    try {
      const res = await apiJson<ExtendSubscriptionResult>(
        '/api/call-center/subscriptions/extend',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            customerId: subscriber.customerId,
            extensionDays: parsed,
          }),
        },
      );
      toast.success(
        t('subscribers.extendSuccess', { days: res.extensionDays }),
      );
      onExtended();
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
            <CalendarClock className="h-5 w-5 text-emerald-600" aria-hidden />
            {t('subscribers.extendDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.extendDialogDescription', {
              name: subscriber?.customerName ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('subscribers.extendPlanLabel')}
            </p>
            <p className="mt-1 font-semibold text-foreground">{planLabel}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extend-days">
              {t('subscribers.extendDaysLabel')}
            </Label>
            <Input
              id="extend-days"
              type="number"
              inputMode="numeric"
              min={EXTEND_MIN_DAYS}
              max={EXTEND_MAX_DAYS}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              {t('subscribers.extendDaysHint', {
                min: EXTEND_MIN_DAYS,
                max: EXTEND_MAX_DAYS,
              })}
            </p>
            {!validDays && days.trim().length > 0 ? (
              <p className="text-xs font-medium text-red-600">
                {t('subscribers.extendDaysInvalid', {
                  min: EXTEND_MIN_DAYS,
                  max: EXTEND_MAX_DAYS,
                })}
              </p>
            ) : null}
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
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CalendarClock className="me-2 h-4 w-4" aria-hidden />
            )}
            {t('subscribers.extendSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubscribersPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, user } = useAuth();
  const allowed = can(user, 'subscribers.view');
  const canManage = can(user, 'subscribers.manage');

  const [rows, setRows] = useState<SubscriberListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Activate-subscription dialog state — powers "new" + "upgrade".
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueMode, setIssueMode] = useState<IssueMode>('new');
  const [issuePrefill, setIssuePrefill] = useState<IssuePrefill | null>(null);

  // Extend dialog — days-only, no wallet movement.
  const [extendTarget, setExtendTarget] = useState<SubscriberListRow | null>(
    null,
  );
  const [extendOpen, setExtendOpen] = useState(false);

  // Management Room "click customer name" dialog.
  const [manageTarget, setManageTarget] = useState<SubscriberListRow | null>(
    null,
  );
  const [manageOpen, setManageOpen] = useState(false);

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

  const handleOpenAccount = useCallback((r: SubscriberListRow) => {
    setManageTarget(r);
    setManageOpen(true);
  }, []);

  const launchExtend = useCallback((r: SubscriberListRow) => {
    // V1.5.3 — Extend routes to its own dialog (days-only, no wallet move).
    setExtendTarget(r);
    setManageOpen(false);
    setExtendOpen(true);
  }, []);

  const launchUpgrade = useCallback((r: SubscriberListRow) => {
    setIssueMode('upgrade');
    setIssuePrefill({
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone ?? null,
      planId: null,
    });
    setManageOpen(false);
    setIssueOpen(true);
  }, []);

  const launchNewIssue = useCallback(() => {
    setIssueMode('new');
    setIssuePrefill(null);
    setIssueOpen(true);
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
          {canManage && token ? (
            <Button
              type="button"
              size="default"
              className="h-11 min-h-11 gap-2"
              onClick={launchNewIssue}
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
                  canManage={canManage}
                  onOpenAccount={handleOpenAccount}
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
                {t('subscribers.colBalance')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows === null ?
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {loading ? t('subscribers.loading') : t('subscribers.unable')}
                </TableCell>
              </TableRow>
            : filteredRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={6}
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
                  <TableCell className="max-w-[14rem] font-medium">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => handleOpenAccount(r)}
                        className="inline-flex items-center gap-1 text-start text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                        title={t('subscribers.manageDialogOpenHint')}
                      >
                        {r.customerName}
                      </button>
                    ) : (
                      r.customerName
                    )}
                  </TableCell>
                  <TableCell className="max-w-[10rem] text-sm">
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
                  <TableCell
                    className={cn(
                      'text-end tabular-nums text-sm font-medium',
                      isCriticalBalance(r.balance) && 'text-red-700',
                    )}
                  >
                    {formatKwdLabel(r.balance)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {canManage ? (
        <ManageAccountDialog
          subscriber={manageTarget}
          open={manageOpen}
          onOpenChange={(n) => {
            setManageOpen(n);
            if (!n) setManageTarget(null);
          }}
          onExtend={launchExtend}
          onUpgrade={launchUpgrade}
        />
      ) : null}

      {canManage && token ? (
        <IssueSubscriptionDialog
          key={`${issueMode}:${issuePrefill?.customerId ?? 'new'}`}
          open={issueOpen}
          onOpenChange={setIssueOpen}
          token={token}
          mode={issueMode}
          prefill={issuePrefill}
          onIssued={() => void load()}
        />
      ) : null}

      {canManage && token ? (
        <ExtendSubscriptionDialog
          key={`extend:${extendTarget?.customerId ?? 'none'}`}
          subscriber={extendTarget}
          open={extendOpen}
          onOpenChange={(n) => {
            setExtendOpen(n);
            if (!n) setExtendTarget(null);
          }}
          token={token}
          onExtended={() => void load()}
        />
      ) : null}
    </div>
  );
}
