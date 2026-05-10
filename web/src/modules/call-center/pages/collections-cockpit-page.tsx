import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/modules/shared/auth/access-matrix';
import {
  useCollectionsWorkflow,
  WorkflowLanes,
  WorkflowQuickAddModal,
  type WorkflowItem,
  type WorkflowKind,
} from '@/modules/collections-workflow';
import { useOperatorPresence, PresenceRibbon, getActiveOperators, type PresenceHeartbeat } from '@/modules/presence';
import {
  QueueHealthBadge,
  classifyAging,
} from '@/modules/workflow-intelligence';
import { useRealtimeFinancialFeed } from '@/modules/finance';
import { RealtimeStatusBadge } from '@/modules/realtime-observability';
import {
  ApiError,
  apiJson,
  type ActivateSubscriptionResponse,
  type CallCenterOperationsSummary,
  type CollectionUnpaidOnlineRow,
  type DebtConversionOptionsResponse,
  type DebtConversionPlanOption,
} from '@/lib/api';
import { formatKwdLabelGrouped } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Badge } from '@/modules/shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/shared/components/ui/dialog';
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
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  Phone,
  ClipboardList,
  ShieldAlert,
  ArrowLeftRight,
  Banknote,
  Link2,
  Wallet,
  RadioTower,
} from 'lucide-react';

void React;

/**
 * V23.1 Phase 7 — Collections Operational Cockpit page.
 *
 * A workflow-first companion to the existing `/cc/collections` page.
 * The classic page (table-centric) remains untouched at its current
 * route for safety & roll-back; this new `/cc/collections/cockpit`
 * wraps the same canonical data behind:
 *
 *   • Top header: queue health badge + realtime status + presence
 *   • Center: 3 operational lanes (callbacks / promises / escalations)
 *     with quick-add and per-card claim/transition actions
 *   • Bottom: aging-grouped queue list with click-to-act bindings
 *   • Sticky right rail: keyboard shortcuts & operator stats
 *
 * Keyboard shortcuts (when no input is focused):
 *   Alt+R  — refresh queue + workflow snapshot
 *   Alt+C  — quick-add CALLBACK for the focused row
 *   Alt+M  — quick-add PROMISE for the focused row
 *   Alt+E  — quick-add ESCALATION for the focused row
 *   ArrowDown / ArrowUp — move row focus inside the queue list
 *
 * STRICT INVARIANTS:
 *   • Every KWD value rendered by this page comes from the canonical
 *     refetch via `apiJson` — workflow `amountKdSnapshot` is rendered
 *     verbatim through `formatKwdLabel*` and never participates in math.
 *   • The page does NOT bypass any payment / settlement endpoint.
 *   • Workflow mutations only touch the visibility-only
 *     `/api/collections/workflow/*` surface.
 */

const QUEUE_POLL_MS = 12_000;

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; rows: CollectionUnpaidOnlineRow[]; fetchedAt: number }
  | { kind: 'error'; message: string };

type SummaryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: CallCenterOperationsSummary; fetchedAt: number }
  | { kind: 'error'; message: string };

type SubscriptionActivationPaymentMethod =
  | 'CASH'
  | 'KNET'
  | 'PAYMENT_LINK'
  | 'ONLINE'
  | 'DEBT_ON_ACCOUNT';

const ACTIVATION_PAYMENT_METHODS: SubscriptionActivationPaymentMethod[] = [
  'CASH',
  'KNET',
  'PAYMENT_LINK',
  'ONLINE',
  'DEBT_ON_ACCOUNT',
];

export function CollectionsCockpitPage(): React.ReactElement {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar') ?? true;
  const locale = (isAr ? 'ar' : 'en') as 'ar' | 'en';
  const { user, token, ownerBranchId } = useAuth();

  const allowed = user != null && can(user, 'collections.view');
  const canAct = user != null && can(user, 'collections.act');
  const canManageSubscribers = user != null && can(user, 'subscribers.manage');

  const [queue, setQueue] = useState<FetchState>({ kind: 'idle' });
  const [summary, setSummary] = useState<SummaryState>({ kind: 'idle' });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<WorkflowKind | null>(null);
  const [convertRow, setConvertRow] = useState<CollectionUnpaidOnlineRow | null>(
    null,
  );

  const branchId =
    user?.safariRole === 'MANAGER' && user.branchId ?
      user.branchId
    : (ownerBranchId ?? null);

  const workflow = useCollectionsWorkflow({ branchId, enabled: allowed });

  // Heartbeat the cockpit using a fixed `collection-row` scope id so other
  // operators in the cockpit show up via /api/presence/active.
  useOperatorPresence({
    scopeKind: 'collection-row',
    scopeId: 'cockpit-queue',
    enabled: allowed,
  });

  const [activeOperators, setActiveOperators] = useState<PresenceHeartbeat[]>([]);
  useEffect(() => {
    if (!allowed || !token) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await getActiveOperators(token);
        if (cancelled) return;
        setActiveOperators(
          res.operators.filter((op) => op.userId !== user?.id),
        );
      } catch {
        /* presence is best-effort */
      }
    };
    void tick();
    const id = window.setInterval(tick, 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [allowed, token, user?.id]);

  const realtimeState = useRealtimeFinancialFeed({
    channel: 'collections',
    accessToken: token ?? null,
    enabled: Boolean(token),
    onEvent: () => {
      void refreshQueue();
      void refreshSummary();
      void workflow.refresh();
    },
  });

  const refreshQueue = useCallback(async () => {
    if (!token || !allowed) return;
    setQueue((prev) =>
      prev.kind === 'ready' ? prev : { kind: 'loading' as const },
    );
    try {
      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
      const data = await apiJson<{ rows: CollectionUnpaidOnlineRow[] }>(
        `/api/orders/collections/unpaid-online${qs}`,
        { token },
      );
      const rows = Array.isArray(data) ? data : data.rows;
      setQueue({ kind: 'ready', rows: rows ?? [], fetchedAt: Date.now() });
    } catch (err) {
      setQueue({
        kind: 'error',
        message: err instanceof Error ? err.message : 'queue_fetch_failed',
      });
    }
  }, [token, allowed, branchId]);

  const refreshSummary = useCallback(async () => {
    if (!token || !allowed) return;
    setSummary((prev) =>
      prev.kind === 'ready' ? prev : { kind: 'loading' as const },
    );
    try {
      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
      const data = await apiJson<CallCenterOperationsSummary>(
        `/api/call-center/operations-summary${qs}`,
        { token },
      );
      setSummary({ kind: 'ready', data, fetchedAt: Date.now() });
    } catch (err) {
      setSummary({
        kind: 'error',
        message: err instanceof Error ? err.message : 'summary_fetch_failed',
      });
    }
  }, [token, allowed, branchId]);

  useEffect(() => {
    if (!allowed) return;
    void refreshQueue();
    void refreshSummary();
    const id = window.setInterval(refreshQueue, QUEUE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshQueue, refreshSummary, allowed]);

  const queueRows = queue.kind === 'ready' ? queue.rows : [];

  const queueHealth = useMemo(() => {
    const counts = { critical: 0, overdue: 0 };
    for (const r of queueRows) {
      const opened = (r as { createdAt?: string }).createdAt;
      if (!opened) continue;
      const c = classifyAging({ openedAtIso: opened });
      if (c.bucket === 'critical') counts.critical += 1;
      else if (c.bucket === 'overdue') counts.overdue += 1;
    }
    return { total: queueRows.length, ...counts };
  }, [queueRows]);

  const focusedRow: CollectionUnpaidOnlineRow | null = useMemo(() => {
    if (!focusedRowId) return queueRows[0] ?? null;
    return queueRows.find((r) => r.orderId === focusedRowId) ?? queueRows[0] ?? null;
  }, [focusedRowId, queueRows]);

  const summaryData = summary.kind === 'ready' ? summary.data : null;

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        void refreshQueue();
        void workflow.refresh();
      }
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (focusedRow) setModalKind('CALLBACK');
      }
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        if (focusedRow) setModalKind('PROMISE');
      }
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (focusedRow) setModalKind('ESCALATION');
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (queueRows.length === 0) return;
        const idx = focusedRow
          ? queueRows.findIndex((r) => r.orderId === focusedRow.orderId)
          : -1;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = Math.max(0, Math.min(queueRows.length - 1, (idx === -1 ? 0 : idx) + delta));
        setFocusedRowId(queueRows[nextIdx]?.orderId ?? null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedRow, queueRows, refreshQueue, workflow]);

  const handleClaim = useCallback(
    async (item: WorkflowItem) => {
      try {
        await workflow.claim(item.id, false);
      } catch {
        // Toast is intentionally omitted to avoid noisy UX.
        // refresh() inside the hook ensures eventual consistency.
      }
    },
    [workflow],
  );
  const handleRelease = useCallback(
    async (item: WorkflowItem) => {
      try {
        await workflow.claim(item.id, true);
      } catch {
        /* noop */
      }
    },
    [workflow],
  );
  const handleComplete = useCallback(
    async (item: WorkflowItem) => {
      try {
        await workflow.transition(item.id, 'COMPLETED');
      } catch {
        /* noop */
      }
    },
    [workflow],
  );
  const handleBreak = useCallback(
    async (item: WorkflowItem) => {
      try {
        await workflow.transition(item.id, 'BROKEN');
      } catch {
        /* noop */
      }
    },
    [workflow],
  );
  const handleCancel = useCallback(
    async (item: WorkflowItem) => {
      try {
        await workflow.transition(item.id, 'CANCELLED');
      } catch {
        /* noop */
      }
    },
    [workflow],
  );

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className="flex min-h-screen flex-col gap-4 p-3 lg:p-5"
      dir={isAr ? 'rtl' : 'ltr'}
      data-testid="collections-cockpit"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {isAr ? 'قمرة قيادة التحصيلات' : 'Collections Cockpit'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'مسارات تشغيلية، تنسيق المشغلين، الوعود، التصعيد — بدون أي عمليات مالية تلقائية.'
              : 'Operational lanes, operator coordination, promises, escalations — no autonomous money operations.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <QueueHealthBadge
              total={queueHealth.total}
              criticalCount={queueHealth.critical}
              overdueCount={queueHealth.overdue}
              ariaLabel={isAr ? 'صحة طابور التحصيلات' : 'Collections queue health'}
            />
            <RealtimeStatusBadge state={realtimeState} />
          </div>
          <div className="mt-2">
            <PresenceRibbon coviewers={activeOperators} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshQueue();
              void refreshSummary();
              void workflow.refresh();
            }}
          >
            <RefreshCw className="me-1 h-3.5 w-3.5" />
            {isAr ? 'تحديث (Alt+R)' : 'Refresh (Alt+R)'}
          </Button>
          <Link to="/cc/collections">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="me-1 h-3.5 w-3.5" />
              {isAr ? 'العرض الكلاسيكي' : 'Classic view'}
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3" aria-label="V25 debt command KPIs">
        <DebtKpiCard
          tone="danger"
          icon={<Wallet className="h-5 w-5" />}
          label={isAr ? 'إجمالي المديونية' : 'Outstanding'}
          value={
            summaryData ?
              formatKwdLabelGrouped(summaryData.totalMarketDebtKd)
            : '—'
          }
          hint={
            isAr ?
              'كل الفواتير المفتوحة من السيرفر'
            : 'All open invoices from server authority'
          }
          loading={summary.kind === 'loading'}
        />
        <DebtKpiCard
          tone="success"
          icon={<Banknote className="h-5 w-5" />}
          label={isAr ? 'المحصل عبر الروابط' : 'Link collected'}
          value={
            summaryData ?
              formatKwdLabelGrouped(summaryData.linkCollectedTodayKd ?? '0')
            : '—'
          }
          hint={
            isAr ?
              'تحصيل اليوم المؤكد من سجل العمليات'
            : 'Today confirmed from the ledger stream'
          }
          loading={summary.kind === 'loading'}
        />
        <DebtKpiCard
          tone="warning"
          icon={<Link2 className="h-5 w-5" />}
          label={isAr ? 'قيد الانتظار' : 'Pending links'}
          value={
            summaryData ?
              formatKwdLabelGrouped(summaryData.pendingLinksKd ?? '0')
            : '—'
          }
          hint={
            summaryData ?
              isAr ?
                `${summaryData.pendingLinksCount} رابط دفع لم يُحصّل بعد`
              : `${summaryData.pendingLinksCount} payment links awaiting capture`
            : isAr ? 'روابط الدفع المفتوحة' : 'Open hosted payment links'
          }
          loading={summary.kind === 'loading'}
        />
      </section>

      {summary.kind === 'error' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {summary.message}
        </p>
      ) : null}

      {/* Workflow lanes */}
      <WorkflowLanes
        snapshot={workflow.snapshot}
        loading={workflow.loading}
        error={workflow.error}
        currentOperatorId={user?.id ?? null}
        locale={locale}
        onQuickAdd={(kind) => {
          if (focusedRow) setModalKind(kind);
        }}
        onClaim={handleClaim}
        onRelease={handleRelease}
        onComplete={handleComplete}
        onBreak={handleBreak}
        onCancel={handleCancel}
      />

      {/* Aging-grouped queue */}
      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]"
        data-testid="cockpit-queue-shell"
      >
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {isAr ? 'طابور الفواتير غير المسددة' : 'Unpaid invoices queue'}
            </h2>
            <span className="text-xs text-slate-500">
              {queue.kind === 'ready' ? `${queue.rows.length} ${isAr ? 'صف' : 'rows'}` : null}
              {queue.kind === 'loading' ? <Loader2 className="ms-1 inline h-3 w-3 animate-spin" /> : null}
            </span>
          </header>
          {queue.kind === 'error' ? (
            <p className="text-xs text-rose-600">{queue.message}</p>
          ) : null}
          {queue.kind !== 'error' && queueRows.length === 0 && queue.kind !== 'loading' ? (
            <p className="rounded border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
              {isAr ? 'لا توجد فواتير مستحقة' : 'No unpaid invoices'}
            </p>
          ) : null}
          <SmartDebtTable
            rows={queueRows}
            focusedRowId={focusedRow?.orderId ?? null}
            locale={locale}
            canConvert={canManageSubscribers && canAct}
            onFocus={(orderId) => setFocusedRowId(orderId)}
            onConvert={(row) => setConvertRow(row)}
          />
        </div>

        {/* Sticky operational rail */}
        <aside
          className="sticky top-3 self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label={isAr ? 'لوحة الإجراءات السريعة' : 'Operational shortcut rail'}
        >
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {isAr ? 'إجراءات سريعة' : 'Quick actions'}
          </h3>
          {focusedRow ? (
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                <div className="font-semibold text-slate-700 dark:text-slate-100">
                  {focusedRow.customerName || focusedRow.readableId}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {focusedRow.readableId} • {formatKwdLabelGrouped(focusedRow.amountKd)}
                </div>
              </div>
              <ShortcutButton
                shortcut="Alt+C"
                label={isAr ? 'جدولة اتصال' : 'Schedule callback'}
                icon={<Phone className="h-3 w-3" />}
                onClick={() => setModalKind('CALLBACK')}
              />
              <ShortcutButton
                shortcut="Alt+M"
                label={isAr ? 'تسجيل وعد' : 'Record promise'}
                icon={<ClipboardList className="h-3 w-3" />}
                onClick={() => setModalKind('PROMISE')}
              />
              <ShortcutButton
                shortcut="Alt+E"
                label={isAr ? 'تصعيد' : 'Escalate'}
                icon={<ShieldAlert className="h-3 w-3" />}
                onClick={() => setModalKind('ESCALATION')}
              />
              {canManageSubscribers && canAct ? (
                <ShortcutButton
                  shortcut="V25"
                  label={isAr ? 'تحويل للاشتراك' : 'Convert to subscription'}
                  icon={<ArrowLeftRight className="h-3 w-3" />}
                  onClick={() => setConvertRow(focusedRow)}
                />
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {isAr ? 'اختر صفًا من الطابور لتفعيل الإجراءات.' : 'Pick a row to enable actions.'}
            </p>
          )}
          <hr className="my-2 border-slate-200 dark:border-slate-700" />
          <h4 className="text-[0.65rem] font-semibold uppercase text-slate-500">
            {isAr ? 'اختصارات الكيبورد' : 'Keyboard shortcuts'}
          </h4>
          <ul className="mt-1.5 space-y-0.5 text-[0.7rem] text-slate-600 dark:text-slate-300">
            <li>↑ / ↓ — {isAr ? 'تنقل بين الصفوف' : 'Move row focus'}</li>
            <li>Alt+R — {isAr ? 'تحديث' : 'Refresh'}</li>
            <li>Alt+C / M / E — {isAr ? 'إضافة سريعة' : 'Quick add'}</li>
          </ul>
        </aside>
      </section>

      {modalKind && focusedRow ? (
        <WorkflowQuickAddModal
          open
          initialKind={modalKind}
          customerId={focusedRow.customerId}
          customerNameSnapshot={focusedRow.customerName}
          branchId={user?.branchId ?? undefined}
          locale={locale}
          onClose={() => setModalKind(null)}
          onSubmit={async (input) => {
            await workflow.create(input);
          }}
        />
      ) : null}

      <DebtConversionDialog
        open={Boolean(convertRow)}
        row={convertRow}
        token={token}
        locale={locale}
        onOpenChange={(next) => {
          if (!next) setConvertRow(null);
        }}
        onConverted={async () => {
          await refreshQueue();
          await refreshSummary();
          await workflow.refresh();
        }}
      />
    </div>
  );
}

function DebtKpiCard(props: {
  tone: 'danger' | 'success' | 'warning';
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  loading: boolean;
}): React.ReactElement {
  const tone =
    props.tone === 'danger' ?
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100'
    : props.tone === 'success' ?
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100';
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold opacity-80">{props.label}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {props.loading ? '—' : props.value}
          </p>
          <p className="mt-1 text-[0.7rem] opacity-75">{props.hint}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/60 dark:bg-black/20">
          {props.icon}
        </span>
      </div>
    </article>
  );
}

function ShortcutButton(props: {
  shortcut: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full items-center justify-between rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <span className="flex items-center gap-1">
        {props.icon}
        {props.label}
      </span>
      <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-[0.6rem] text-slate-700 dark:bg-slate-700 dark:text-slate-200">
        {props.shortcut}
      </kbd>
    </button>
  );
}

function SmartDebtTable(props: {
  rows: CollectionUnpaidOnlineRow[];
  focusedRowId: string | null;
  locale: 'en' | 'ar';
  canConvert: boolean;
  onFocus: (orderId: string) => void;
  onConvert: (row: CollectionUnpaidOnlineRow) => void;
}): React.ReactElement {
  const isAr = props.locale === 'ar';
  if (props.rows.length === 0) {
    return <div className="hidden" />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isAr ? 'الإشارة' : 'Signal'}</TableHead>
            <TableHead>{isAr ? 'العميل' : 'Customer'}</TableHead>
            <TableHead>{isAr ? 'الفاتورة' : 'Invoice'}</TableHead>
            <TableHead>{isAr ? 'العمر' : 'Age'}</TableHead>
            <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
            <TableHead className="text-end">{isAr ? 'المبلغ' : 'Amount'}</TableHead>
            <TableHead className="text-end">{isAr ? 'إجراء' : 'Action'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((row) => {
            const focused = row.orderId === props.focusedRowId;
            const signal = classifyDebtSignal(row, isAr);
            return (
              <TableRow
                key={row.orderId}
                data-testid="debt-command-row"
                className={
                  focused ?
                    'bg-sky-50 dark:bg-sky-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }
                onClick={() => props.onFocus(row.orderId)}
              >
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${signal.className}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {signal.label}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="min-w-40">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {row.customerName || '—'}
                    </div>
                    <div className="text-[0.68rem] text-slate-500">
                      {row.customerPhone || '—'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{row.readableId}</div>
                  <div className="text-[0.68rem] text-slate-500">
                    {row.branchName ?? '—'} · {row.driverName ?? '—'}
                  </div>
                </TableCell>
                <TableCell>
                  {row.invoiceAgeDays} {isAr ? 'يوم' : 'days'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.paymentMethod ?? 'UNSET'}</Badge>
                </TableCell>
                <TableCell className="text-end font-mono font-bold">
                  {formatKwdLabelGrouped(row.amountKd)}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!props.canConvert}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onFocus(row.orderId);
                      props.onConvert(row);
                    }}
                  >
                    <ArrowLeftRight className="me-1 h-3.5 w-3.5" />
                    {isAr ? 'تحويل للاشتراك' : 'Convert'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function classifyDebtSignal(
  row: CollectionUnpaidOnlineRow,
  isAr: boolean,
): { label: string; className: string } {
  const hasPendingLink =
    row.paymentUrl != null ||
    row.paymentMethod === 'PAYMENT_LINK' ||
    row.paymentMethod === 'ONLINE';
  if (row.invoiceAgeDays >= 60) {
    return {
      label: isAr ? 'متأخر' : 'Overdue',
      className:
        'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200',
    };
  }
  if (hasPendingLink) {
    return {
      label: isAr ? 'رابط مرسل' : 'Link sent',
      className:
        'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
    };
  }
  return {
    label: isAr ? 'مفتوح' : 'Open',
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  };
}

function DebtConversionDialog(props: {
  open: boolean;
  row: CollectionUnpaidOnlineRow | null;
  token: string | null;
  locale: 'en' | 'ar';
  onOpenChange: (next: boolean) => void;
  onConverted: () => Promise<void>;
}): React.ReactElement | null {
  const isAr = props.locale === 'ar';
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DebtConversionOptionsResponse | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<SubscriptionActivationPaymentMethod>('PAYMENT_LINK');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open || !props.row || !props.token) {
      setData(null);
      setSelectedPlanId('');
      setPaymentMethod('PAYMENT_LINK');
      return;
    }
    const customerId = props.row.customerId;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const res = await apiJson<DebtConversionOptionsResponse>(
          `/api/call-center/customers/${customerId}/debt-conversion-options?paymentMethod=${encodeURIComponent(paymentMethod)}`,
          { token: props.token },
        );
        if (!alive) return;
        setData(res);
        setSelectedPlanId(res.options.find((o) => o.recommended)?.planId ?? '');
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.open, props.row, props.token, paymentMethod]);

  const selected = useMemo<DebtConversionPlanOption | null>(() => {
    if (!data || !selectedPlanId) return null;
    return data.options.find((o) => o.planId === selectedPlanId) ?? null;
  }, [data, selectedPlanId]);

  const submit = useCallback(async () => {
    if (!props.row || !props.token || !selected) return;
    setSubmitting(true);
    try {
      const res = await apiJson<ActivateSubscriptionResponse>(
        '/api/call-center/subscriptions/activate',
        {
          method: 'POST',
          token: props.token,
          body: JSON.stringify({
            customerId: props.row.customerId,
            planId: selected.planId,
            autoCloseInvoices: true,
            paymentMethod,
          }),
        },
      );
      toast.success(
        isAr ?
          `تم تحويل المديونية للاشتراك: سُوي ${formatKwdLabelGrouped(res.settlement.debtSettled)}`
        : `Debt converted: settled ${formatKwdLabelGrouped(res.settlement.debtSettled)}`,
      );
      props.onOpenChange(false);
      await props.onConverted();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [props, selected, paymentMethod, isAr]);

  if (!props.open) return null;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
            {isAr ? 'تحويل المديونية إلى اشتراك' : 'Convert Debt to Subscription'}
          </DialogTitle>
          <DialogDescription>
            {isAr ?
              'النواة المالية ستغلق الفواتير المفتوحة وتفتح اشتراكاً جديداً مع أثر تدقيق غير قابل للكسر.'
            : 'The financial core closes open invoices and opens a new subscription with immutable audit trail.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/60">
          <div className="font-semibold">
            {props.row?.customerName ?? '—'} · {props.row?.customerPhone ?? '—'}
          </div>
          <div className="mt-1 text-slate-500">
            {isAr ? 'الفاتورة المختارة' : 'Selected invoice'}:{' '}
            {props.row?.readableId ?? '—'} ·{' '}
            {formatKwdLabelGrouped(props.row?.amountKd ?? '0')}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            <span>{isAr ? 'طريقة تحصيل قيمة الاشتراك' : 'Subscription sale method'}</span>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(v as SubscriptionActivationPaymentMethod)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVATION_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100">
            <RadioTower className="mb-1 h-4 w-4" />
            {isAr ?
              'V25 يستخدم نفس محرك التفعيل الحالي: autoCloseInvoices=true، وTransactionHistory + DebtLedgerEntry تحفظ أرقام الفواتير القديمة.'
            : 'V25 uses the existing activation engine: autoCloseInvoices=true, with TransactionHistory + DebtLedgerEntry preserving old invoice refs.'}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            {isAr ? 'تحميل خيارات الاشتراك…' : 'Loading subscription options…'}
          </div>
        ) : !data || data.options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
            {isAr ? 'لا توجد باقات مناسبة حالياً.' : 'No subscription plans available.'}
          </p>
        ) : (
          <div className="grid gap-2">
            {data.options.map((option) => {
              const selectedOption = option.planId === selectedPlanId;
              return (
                <button
                  type="button"
                  key={option.planId}
                  onClick={() => setSelectedPlanId(option.planId)}
                  className={`rounded-xl border p-3 text-start text-xs transition ${
                    selectedOption ?
                      'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:bg-indigo-950/30'
                    : option.recommended ?
                      'border-emerald-300 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{option.planName}</div>
                      <div className="mt-1 text-slate-500">
                        {option.planValidityDays} {isAr ? 'يوم' : 'days'} ·{' '}
                        {isAr ? 'قيمة الاشتراك' : 'Sale'}{' '}
                        {formatKwdLabelGrouped(option.cashRequiredKd)}
                      </div>
                    </div>
                    {option.recommended ? (
                      <Badge variant="secondary">
                        {isAr ? 'موصى به' : 'Recommended'}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <MiniMoney label={isAr ? 'يسوي' : 'Settles'} value={option.debtToSettleKd} />
                    <MiniMoney label={isAr ? 'المتبقي' : 'Remaining'} value={option.remainingDebtKd} />
                    <MiniMoney label={isAr ? 'رصيد جديد' : 'Credit'} value={option.creditedToBalanceKd} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={submitting}
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!selected || submitting}
          >
            {submitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {isAr ? 'تنفيذ التحويل' : 'Convert now'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniMoney(props: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-white/70 p-2 dark:bg-black/20">
      <div className="text-[0.65rem] text-slate-500">{props.label}</div>
      <div className="font-mono font-semibold">
        {formatKwdLabelGrouped(props.value)}
      </div>
    </div>
  );
}

export default CollectionsCockpitPage;
