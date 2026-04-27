import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { CustomerLedgerPanel } from '@/modules/call-center/components/customer-ledger-panel';
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
  type DebtConversionOptionsResponse,
  type DebtConversionPlanOption,
  type ExtendSubscriptionResult,
  type RecordPartialDebtPaymentRequest,
  type RecordPartialDebtPaymentResponse,
  type SubscriberListRow,
  apiJson,
  ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatKwdLabel, formatSignedKwdLabel } from '@/lib/kwd';

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

/** Text colour: debt vs neutral zero vs low prepaid vs healthy credit. */
function subscriberBalanceClass(balance: string): string {
  const n = Number.parseFloat(balance);
  if (!Number.isFinite(n)) return '';
  if (n < 0) return 'text-red-700 dark:text-red-400';
  if (n === 0) return 'text-muted-foreground';
  if (n < 10) return 'text-red-700 dark:text-red-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

function isLowPrepaidBalance(balance: string): boolean {
  const n = Number.parseFloat(balance);
  return Number.isFinite(n) && n > 0 && n < 10;
}

/** Prepaid low-balance warn only while subscription is not in expired net view. */
function isLowPrepaidBalanceRow(r: SubscriberListRow): boolean {
  if (
    r.rowStatus === 'expired' ||
    (r.remainingDays !== null && r.remainingDays < 0)
  ) {
    return false;
  }
  return isLowPrepaidBalance(r.balance);
}

function subscriberListBalanceDisplay(r: SubscriberListRow): string {
  return r.balanceDisplayKd ?? r.balance;
}

type SubscribersNumSortKey = 'remainingDays' | 'balance';

function NumSortHeaderButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc' | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex w-full max-w-full items-center justify-end gap-1.5 font-bold text-foreground hover:underline"
      onClick={onClick}
    >
      <span className="min-w-0 text-end">{label}</span>
      {active && dir ?
        (dir === 'asc' ?
          <ArrowUp className="size-3.5 shrink-0 opacity-90" aria-hidden />
        : <ArrowDown className="size-3.5 shrink-0 opacity-90" aria-hidden />)
      : <ArrowUpDown
          className="size-3.5 shrink-0 text-muted-foreground/70"
          aria-hidden
        />
      }
    </button>
  );
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
            dir="ltr"
            className={cn(
              'font-mono tabular-nums text-base font-bold sm:text-sm',
              subscriberBalanceClass(subscriberListBalanceDisplay(r)),
            )}
          >
            {formatSignedKwdLabel(subscriberListBalanceDisplay(r))}
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
          <dd
            dir="ltr"
            className="font-mono text-base font-medium tabular-nums sm:text-sm"
          >
            {r.remainingDays === null ? '—' : r.remainingDays}
          </dd>
        </div>
      </dl>
      {isLowPrepaidBalanceRow(r) ? (
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
  onPayDebt,
  onConvertDebt,
  onStatement,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onExtend: (r: SubscriberListRow) => void;
  onUpgrade: (r: SubscriberListRow) => void;
  onPayDebt: (r: SubscriberListRow) => void;
  onConvertDebt: (r: SubscriberListRow) => void;
  onStatement: (r: SubscriberListRow) => void;
}) {
  const { t } = useTranslation();
  const canExtend = Boolean(subscriber?.planId);
  // V19.4 — CC pack #1. Hide the debt action when the customer has
  // no outstanding debt; keeping the button visible-but-disabled
  // would just add visual noise mid-call. Guarded with Number.parse
  // so legacy rows without a `debt` field collapse to "no debt".
  const debtAmount = Number.parseFloat(subscriber?.debt ?? '0') || 0;
  const hasDebt = debtAmount > 0;
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

          {hasDebt && subscriber ? (
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 p-4 text-start transition hover:border-red-400 hover:bg-red-100/70 dark:border-red-900/60 dark:bg-red-950/20 dark:hover:bg-red-950/40"
              onClick={() => onPayDebt(subscriber)}
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200">
                <CircleDollarSign className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {t('subscribers.managePayDebtTitle')}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('subscribers.managePayDebtHint', {
                    debt: formatKwdLabel(subscriber.debt),
                  })}
                </span>
              </span>
            </button>
          ) : null}

          {/* V19.4 — CC pack #9. Convert debt → subscription. Shown only
              when the customer still has debt; otherwise the action has
              no business meaning and would just be noise in the hub. */}
          {hasDebt && subscriber ? (
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 text-start transition hover:border-indigo-400 hover:bg-indigo-100/70 dark:border-indigo-900/60 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40"
              onClick={() => onConvertDebt(subscriber)}
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">
                <ArrowLeftRight className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {t('subscribers.manageConvertDebtTitle')}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('subscribers.manageConvertDebtHint', {
                    debt: formatKwdLabel(subscriber.debt),
                  })}
                </span>
              </span>
            </button>
          ) : null}

          {/* V19.7.5 — "كشف حساب العميل". Always available regardless
              of debt or plan state; the agent should be able to review
              the full customer timeline + every invoice before taking
              any action. Reuses the Customer 360 ledger panel, which
              also exposes per-invoice "عرض صورة الفاتورة" links. */}
          {subscriber ? (
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-4 text-start transition hover:border-sky-400 hover:bg-sky-100/70 dark:border-sky-900/60 dark:bg-sky-950/20 dark:hover:bg-sky-950/40"
              onClick={() => onStatement(subscriber)}
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {t('subscribers.manageStatementTitle')}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('subscribers.manageStatementHint')}
                </span>
              </span>
            </button>
          ) : null}
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
 * V19.7.5 — Customer account statement ("كشف حساب العميل"). Thin
 * wrapper around the Customer 360 ledger panel so the Subscribers page
 * can offer a full statement view (wallet + active subscription +
 * every invoice with per-row "view invoice image" buttons + chronological
 * timeline) without duplicating the Collections page's dedicated
 * surface. Kept read-only: all mutations still go through the
 * purpose-built dialogs (Extend/Upgrade/PayDebt/Convert).
 */
function StatementDialog({
  subscriber,
  open,
  onOpenChange,
  token,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-sky-600" aria-hidden />
            {t('subscribers.statementDialogTitle', {
              name: subscriber?.customerName ?? '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.statementDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        {subscriber ? (
          <CustomerLedgerPanel
            customerId={subscriber.customerId}
            token={token}
          />
        ) : null}
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
          // Same as convert-debt: when plan credit settles wallet debt, FIFO-close
          // matching UNPAID invoices. Backend no-ops when debtPaidMinor is 0.
          autoCloseInvoices: true,
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
                >
                  {planId
                    ? ((plans ?? []).find((p) => p.id === planId)?.name ??
                      t('subscribers.issuePlanPlaceholder'))
                    : null}
                </SelectValue>
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
 * V19.4 — CC pack #1. Partial debt payment dialog.
 *
 * Opened from the Manage-Account dialog when the customer has debt > 0.
 * The agent types the cash collected, an optional goodwill discount,
 * and the payment method; the server validates `amount + discount
 * <= wallet.debt` and writes a TransactionHistory + two GL entries
 * (see `CustomerLedgerService.recordPartialDebtPayment`).
 *
 * Intentionally kept as a separate dialog rather than inline inside
 * the Manage dialog because:
 *   1. The Manage dialog is a hub — stacking a form inside it would
 *      force the agent to scroll between actions mid-call.
 *   2. Dialog-within-dialog gives a clear Back button and preserves
 *      the context ("we were managing X, now collecting debt on X").
 */
function DebtPaymentDialog({
  subscriber,
  open,
  onOpenChange,
  token,
  onSettled,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  onSettled: () => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] =
    useState<RecordPartialDebtPaymentRequest['paymentMethod']>('CASH');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setDiscount('');
      setMethod('CASH');
      setNote('');
    }
  }, [open]);

  const debtNum = Number.parseFloat(subscriber?.debt ?? '0') || 0;
  const amountNum = Number.parseFloat(amount || '0') || 0;
  const discountNum = Number.parseFloat(discount || '0') || 0;
  const totalReduction = amountNum + discountNum;
  const remaining = Math.max(0, debtNum - totalReduction);
  const overCap = totalReduction > debtNum + 1e-9;
  const disabled =
    submitting ||
    overCap ||
    totalReduction <= 0 ||
    amountNum < 0 ||
    discountNum < 0;

  async function submit() {
    if (!subscriber || disabled) return;
    setSubmitting(true);
    try {
      const body: RecordPartialDebtPaymentRequest = {
        amountKd: amountNum.toFixed(4),
        paymentMethod: method,
      };
      if (discountNum > 0) body.discountKd = discountNum.toFixed(4);
      if (note.trim()) body.note = note.trim();
      const res = await apiJson<RecordPartialDebtPaymentResponse>(
        `/api/call-center/customers/${subscriber.customerId}/partial-debt-payment`,
        { method: 'POST', token, body: JSON.stringify(body) },
      );
      toast.success(
        t('subscribers.debtPaySuccess', {
          collected: formatKwdLabel(res.amountCollectedKd),
          discount: formatKwdLabel(res.discountAppliedKd),
          remaining: formatKwdLabel(res.newDebtKd),
        }),
      );
      onOpenChange(false);
      onSettled();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <CircleDollarSign className="h-5 w-5" aria-hidden />
            {t('subscribers.debtPayTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.debtPayHint', {
              name: subscriber?.customerName ?? '',
              debt: formatKwdLabel(subscriber?.debt ?? '0'),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debt-amount">
                {t('subscribers.debtPayAmountLabel')}
              </Label>
              <Input
                id="debt-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-discount">
                {t('subscribers.debtPayDiscountLabel')}
              </Label>
              <Input
                id="debt-discount"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('subscribers.debtPayMethodLabel')}</Label>
            <Select
              value={method}
              onValueChange={(v) =>
                setMethod(
                  v as RecordPartialDebtPaymentRequest['paymentMethod'],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">
                  {t('subscribers.debtPayMethodCash')}
                </SelectItem>
                <SelectItem value="KNET">
                  {t('subscribers.debtPayMethodKnet')}
                </SelectItem>
                <SelectItem value="PAYMENT_LINK">
                  {t('subscribers.debtPayMethodLink')}
                </SelectItem>
                <SelectItem value="ONLINE">
                  {t('subscribers.debtPayMethodOnline')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debt-note">
              {t('subscribers.debtPayNoteLabel')}
            </Label>
            <Input
              id="debt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('subscribers.debtPayNotePlaceholder')}
              maxLength={240}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-md border border-dashed border-red-300 bg-muted/40 px-3 py-2 text-sm tabular-nums dark:border-red-900/60">
            <div>
              <div className="text-[11px] text-muted-foreground">
                {t('subscribers.debtPayTotalReduction')}
              </div>
              <div className="font-medium text-foreground">
                {formatKwdLabel(totalReduction.toFixed(4))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                {t('subscribers.debtPayRemaining')}
              </div>
              <div className="font-medium text-foreground">
                {formatKwdLabel(remaining.toFixed(4))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">
                {t('subscribers.debtPayCurrentDebt')}
              </div>
              <div className="font-medium text-foreground">
                {formatKwdLabel(subscriber?.debt ?? '0')}
              </div>
            </div>
          </div>
          {overCap ? (
            <p className="text-xs text-red-700 dark:text-red-300">
              {t('subscribers.debtPayOverCap')}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('subscribers.manageClose')}
          </Button>
          <Button
            type="button"
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={disabled}
            onClick={() => void submit()}
          >
            {submitting
              ? t('subscribers.debtPaySubmitting')
              : t('subscribers.debtPaySubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * V19.4 — CC pack #9. "Convert debt → subscription" dialog.
 *
 * The Call Center agent opens this from the Manage-Account hub when
 * the customer has outstanding debt. We fetch
 * `/api/call-center/customers/:id/debt-conversion-options`, which
 * previews — for every active plan — exactly what activating it would
 * do to the wallet (debt cleared vs. remaining, cash required,
 * projected prepaid balance, goodwill subsidy).
 *
 * The preview arithmetic is *byte-identical* to the committed
 * `activateSubscriptionPlan` flow on the backend, so the agent never
 * sees a number here that disagrees with the receipt after confirm.
 *
 * Plans flagged `recommended` (plan.actualBalance ≥ currentDebt) are
 * visually highlighted because those are the ones that fully kill the
 * debt in a single activation — which is the whole point of the
 * "convert debt" workflow.
 */
function DebtConvertDialog({
  subscriber,
  open,
  onOpenChange,
  token,
  onConverted,
}: {
  subscriber: SubscriberListRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  token: string;
  onConverted: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DebtConversionOptionsResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !subscriber) {
      setData(null);
      setSelectedPlanId('');
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await apiJson<DebtConversionOptionsResponse>(
          `/api/call-center/customers/${subscriber.customerId}/debt-conversion-options`,
          { token },
        );
        if (!alive) return;
        setData(res);
        // Pre-select the cheapest "recommended" plan to save the agent a
        // click in the common case. If none clear all debt, leave empty
        // so the agent has to make a conscious choice.
        const firstRec = res.options.find((o) => o.recommended);
        setSelectedPlanId(firstRec?.planId ?? '');
      } catch (e) {
        if (e instanceof ApiError) toast.error(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, subscriber, token]);

  const selected = useMemo<DebtConversionPlanOption | null>(() => {
    if (!data || !selectedPlanId) return null;
    return data.options.find((o) => o.planId === selectedPlanId) ?? null;
  }, [data, selectedPlanId]);

  const disabled = submitting || !subscriber || !selected;

  async function submit() {
    if (disabled || !subscriber || !selected) return;
    setSubmitting(true);
    try {
      await apiJson('/api/call-center/subscriptions/activate', {
        method: 'POST',
        token,
        body: JSON.stringify({
          customerId: subscriber.customerId,
          planId: selected.planId,
          // FIFO-close UNPAID invoices when activation pays down wallet debt.
          // Issue/upgrade dialog also sends this; backend skips when no debt settled.
          autoCloseInvoices: true,
        }),
      });
      toast.success(
        t('subscribers.convertDebtSuccess', {
          plan: selected.planName,
          cleared: formatKwdLabel(selected.debtToSettleKd),
          remaining: formatKwdLabel(selected.remainingDebtKd),
        }),
      );
      onConverted();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" aria-hidden />
            {t('subscribers.convertDebtDialogTitle', {
              name: subscriber?.customerName ?? '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('subscribers.convertDebtDialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
            {t('subscribers.convertDebtLoading')}
          </div>
        ) : !data ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t('subscribers.convertDebtEmpty')}
          </p>
        ) : !data.hasDebt ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            {t('subscribers.convertDebtNoDebt')}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {t('subscribers.convertDebtCurrentDebt')}
                </span>
                <span className="tabular-nums font-semibold text-red-700">
                  {formatKwdLabel(data.currentDebtKd)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                <span>{t('subscribers.convertDebtCurrentBalance')}</span>
                <span className="tabular-nums">
                  {formatKwdLabel(data.currentBalanceKd)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {data.options.length === 0 ? (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {t('subscribers.convertDebtNoPlans')}
                </p>
              ) : (
                data.options.map((opt) => {
                  const isSelected = opt.planId === selectedPlanId;
                  return (
                    <button
                      key={opt.planId}
                      type="button"
                      onClick={() => setSelectedPlanId(opt.planId)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-start transition',
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-border bg-card hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20',
                        opt.recommended &&
                          !isSelected &&
                          'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{opt.planName}</span>
                          {opt.recommended ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              {t('subscribers.convertDebtRecommended')}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t('subscribers.convertDebtValidity', {
                            days: opt.planValidityDays,
                          })}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtCashRequired')}
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatKwdLabel(opt.cashRequiredKd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtPlanBalance')}
                          </span>
                          <span className="tabular-nums">
                            {formatKwdLabel(opt.planActualBalanceKd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtDebtCleared')}
                          </span>
                          <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                            −{formatKwdLabel(opt.debtToSettleKd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtRemaining')}
                          </span>
                          <span
                            className={cn(
                              'tabular-nums font-medium',
                              Number.parseFloat(opt.remainingDebtKd) > 0
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-emerald-700 dark:text-emerald-300',
                            )}
                          >
                            {formatKwdLabel(opt.remainingDebtKd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtCreditedToBalance')}
                          </span>
                          <span className="tabular-nums">
                            {formatKwdLabel(opt.creditedToBalanceKd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {t('subscribers.convertDebtProjectedBalance')}
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatKwdLabel(opt.projectedWalletBalanceKd)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('subscribers.convertDebtCancel')}
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={disabled}
            onClick={() => void submit()}
          >
            {submitting
              ? t('subscribers.convertDebtSubmitting')
              : t('subscribers.convertDebtSubmit')}
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

const ACTIVATE_CUSTOMER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SubscribersPage() {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkKey = useRef<string | null>(null);
  const allowed = can(user, 'subscribers.view');
  const canManage = can(user, 'subscribers.manage');

  const [rows, setRows] = useState<SubscriberListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [numSort, setNumSort] = useState<{
    key: SubscribersNumSortKey;
    dir: 'asc' | 'desc';
  } | null>(null);

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

  // V19.4 — CC pack #1. Partial-debt-payment dialog launched from the
  // Manage dialog when the customer has debt > 0.
  const [debtTarget, setDebtTarget] = useState<SubscriberListRow | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);

  // V19.4 — CC pack #9. "Convert debt → subscription" preview dialog,
  // also launched from the Manage hub when debt > 0.
  const [convertTarget, setConvertTarget] =
    useState<SubscriberListRow | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  // V19.7.5 — Customer account statement dialog (كشف حساب).
  // Always available from the Manage hub regardless of debt or plan.
  const [statementTarget, setStatementTarget] =
    useState<SubscriberListRow | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);

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
   * Deep-link from المديونية: `/subscribers?activateCustomer=uuid&n=&p=`
   * — if the customer is already in the list, open Manage; if not, open
   * Issue (new subscription) with the customer pre-filled.
   */
  useEffect(() => {
    if (!token || !allowed) return;
    if (rows === null) return;

    const ac = searchParams.get('activateCustomer')?.trim() ?? '';
    if (!ac) {
      deepLinkKey.current = null;
      return;
    }
    if (!ACTIVATE_CUSTOMER_RE.test(ac)) {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('activateCustomer');
          n.delete('n');
          n.delete('p');
          return n;
        },
        { replace: true },
      );
      return;
    }

    const n = (searchParams.get('n') ?? '').trim();
    const p = (searchParams.get('p') ?? '').trim();
    const k = `${ac}|${n}|${p}`;
    if (deepLinkKey.current === k) return;
    deepLinkKey.current = k;

    setSearchParams(
      (prev) => {
        const nsp = new URLSearchParams(prev);
        nsp.delete('activateCustomer');
        nsp.delete('n');
        nsp.delete('p');
        return nsp;
      },
      { replace: true },
    );

    const match = rows.find((r) => r.customerId === ac);
    if (canManage) {
      if (match) {
        setManageTarget(match);
        setManageOpen(true);
      } else {
        setIssueMode('new');
        setIssuePrefill({
          customerId: ac,
          customerName: n || '—',
          customerPhone: p || null,
          planId: null,
        });
        setIssueOpen(true);
      }
    } else {
      if (p) setQuery(p);
      toast.info(t('subscribers.deepLinkViewOnly'));
    }
  }, [
    token,
    allowed,
    rows,
    canManage,
    searchParams,
    setSearchParams,
    t,
  ]);

  /** `?q=` from المديونية (read-only) — pre-fill search, then clear URL. */
  useEffect(() => {
    if (!allowed) return;
    if (searchParams.get('activateCustomer')?.trim()) return;
    const onlyQ = searchParams.get('q')?.trim() ?? '';
    if (!onlyQ) return;
    setQuery(onlyQ);
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('q');
        return n;
      },
      { replace: true },
    );
  }, [allowed, searchParams, setSearchParams]);

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

  const launchPayDebt = useCallback((r: SubscriberListRow) => {
    setDebtTarget(r);
    setManageOpen(false);
    setDebtOpen(true);
  }, []);

  const launchConvertDebt = useCallback((r: SubscriberListRow) => {
    setConvertTarget(r);
    setManageOpen(false);
    setConvertOpen(true);
  }, []);

  const launchStatement = useCallback((r: SubscriberListRow) => {
    setStatementTarget(r);
    setManageOpen(false);
    setStatementOpen(true);
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

  // V19.4 — CC pack point #3: "قائمة المشتركين برقم التلفون".
  // Previously the digit path only searched inside `customerName`, so a
  // query of "97700000" against a row whose name is "عبدالله" and
  // phone is "97700000" would silently fail. Now we normalise both the
  // customerPhone column and customerName, and we also match the phone
  // against the raw lowercase needle (for partial-digit typing like
  // "770"). Keeps existing name / subscription-type behaviour.
  const filteredRows = useMemo(() => {
    if (!rows) return null;
    const q = query.trim();
    if (!q) return rows;
    const digits = normalisePhone(q);
    const needle = q.toLowerCase();
    return rows.filter((r) => {
      if (r.customerName?.toLowerCase().includes(needle)) return true;
      if (r.subscriptionType?.toLowerCase().includes(needle)) return true;
      if (r.customerPhone?.toLowerCase().includes(needle)) return true;
      if (digits) {
        if (normalisePhone(r.customerPhone ?? '').includes(digits)) return true;
        if (normalisePhone(r.customerName ?? '').includes(digits)) return true;
      }
      return false;
    });
  }, [rows, query]);

  const toggleNumSort = useCallback((key: SubscribersNumSortKey) => {
    setNumSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: key === 'balance' ? 'desc' : 'asc' };
    });
  }, []);

  const displayRows = useMemo(() => {
    if (!filteredRows) return null;
    if (!numSort) return filteredRows;
    const arr = [...filteredRows];
    const mult = numSort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (numSort.key === 'remainingDays') {
        const av = a.remainingDays;
        const bv = b.remainingDays;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * mult;
      }
      const av = Number.parseFloat(subscriberListBalanceDisplay(a));
      const bv = Number.parseFloat(subscriberListBalanceDisplay(b));
      const aOk = Number.isFinite(av);
      const bOk = Number.isFinite(bv);
      if (!aOk && !bOk) return 0;
      if (!aOk) return 1;
      if (!bOk) return -1;
      return (av - bv) * mult;
    });
    return arr;
  }, [filteredRows, numSort]);

  useEffect(() => {
    setNumSort(null);
  }, [query]);

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
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {t('subscribers.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subscribers.subtitle')}</p>
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
        {displayRows === null ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {loading ? t('subscribers.loading') : t('subscribers.unable')}
          </p>
        : displayRows.length === 0 ?
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {query.trim() ? t('subscribers.emptySearch') : t('subscribers.empty')}
          </p>
        : <ul className="space-y-3">
            {displayRows.map((r) => (
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

      <div className="hidden min-w-0 overflow-x-auto rounded-xl border border-border bg-card shadow-sm md:block">
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
              <TableHead
                className="whitespace-nowrap text-end tabular-nums"
                aria-sort={
                  numSort?.key === 'remainingDays' ?
                    numSort.dir === 'asc' ?
                      'ascending'
                    : 'descending'
                  : 'none'
                }
              >
                <NumSortHeaderButton
                  label={t('subscribers.colRemaining')}
                  active={numSort?.key === 'remainingDays'}
                  dir={
                    numSort?.key === 'remainingDays' ? numSort.dir : null
                  }
                  onClick={() => toggleNumSort('remainingDays')}
                />
              </TableHead>
              <TableHead
                className="whitespace-nowrap text-end tabular-nums"
                aria-sort={
                  numSort?.key === 'balance' ?
                    numSort.dir === 'asc' ?
                      'ascending'
                    : 'descending'
                  : 'none'
                }
              >
                <NumSortHeaderButton
                  label={t('subscribers.colBalance')}
                  active={numSort?.key === 'balance'}
                  dir={numSort?.key === 'balance' ? numSort.dir : null}
                  onClick={() => toggleNumSort('balance')}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows === null ?
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {loading ? t('subscribers.loading') : t('subscribers.unable')}
                </TableCell>
              </TableRow>
            : displayRows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  {query.trim() ? t('subscribers.emptySearch') : t('subscribers.empty')}
                </TableCell>
              </TableRow>
            : displayRows.map((r) => (
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
                  <TableCell className="w-[1%] min-w-[4.5rem] py-2.5 pe-2 ps-2 text-end align-middle">
                    <span
                      dir="ltr"
                      className="inline-block min-w-[2.5rem] font-mono text-sm tabular-nums text-foreground"
                    >
                      {r.remainingDays === null ? '—' : r.remainingDays}
                    </span>
                  </TableCell>
                  <TableCell className="w-[1%] min-w-[7.5rem] py-2.5 pe-2 ps-2 text-end align-middle">
                    <span
                      dir="ltr"
                      className={cn(
                        'inline-block min-w-[5.5rem] font-mono text-sm font-medium tabular-nums',
                        subscriberBalanceClass(
                          subscriberListBalanceDisplay(r),
                        ),
                      )}
                    >
                      {formatSignedKwdLabel(subscriberListBalanceDisplay(r))}
                    </span>
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
          onPayDebt={launchPayDebt}
          onConvertDebt={launchConvertDebt}
          onStatement={launchStatement}
        />
      ) : null}

      {canManage ? (
        <StatementDialog
          subscriber={statementTarget}
          open={statementOpen}
          onOpenChange={(n) => {
            setStatementOpen(n);
            if (!n) setStatementTarget(null);
          }}
          token={token}
        />
      ) : null}

      {canManage && token ? (
        <DebtPaymentDialog
          key={`debt:${debtTarget?.customerId ?? 'none'}`}
          subscriber={debtTarget}
          open={debtOpen}
          onOpenChange={(n) => {
            setDebtOpen(n);
            if (!n) setDebtTarget(null);
          }}
          token={token}
          onSettled={() => void load()}
        />
      ) : null}

      {canManage && token ? (
        <DebtConvertDialog
          key={`convert:${convertTarget?.customerId ?? 'none'}`}
          subscriber={convertTarget}
          open={convertOpen}
          onOpenChange={(n) => {
            setConvertOpen(n);
            if (!n) setConvertTarget(null);
          }}
          token={token}
          onConverted={() => void load()}
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
