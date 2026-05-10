import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
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
  AgingBadge,
  QueueHealthBadge,
  classifyAging,
  groupByAgingBucket,
  type AgingBucket,
} from '@/modules/workflow-intelligence';
import { useRealtimeFinancialFeed } from '@/modules/finance';
import { RealtimeStatusBadge } from '@/modules/realtime-observability';
import { apiJson, type CollectionUnpaidOnlineRow } from '@/lib/api';
import { formatKwdLabelGrouped } from '@/lib/kwd';
import { Button } from '@/modules/shared/components/ui/button';
import { Badge } from '@/modules/shared/components/ui/badge';
import { Loader2, ArrowLeft, RefreshCw, Phone, ClipboardList, ShieldAlert } from 'lucide-react';

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

export function CollectionsCockpitPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar') ?? true;
  const locale = (isAr ? 'ar' : 'en') as 'ar' | 'en';
  const { user, token } = useAuth();

  const allowed = user != null && can(user, 'collections.view');

  const [queue, setQueue] = useState<FetchState>({ kind: 'idle' });
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<WorkflowKind | null>(null);

  const branchId = user?.branchId ?? null;

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
    channel: 'dashboards',
    accessToken: token ?? null,
    enabled: Boolean(token),
  });

  const refreshQueue = useCallback(async () => {
    if (!token || !allowed) return;
    setQueue((prev) =>
      prev.kind === 'ready' ? prev : { kind: 'loading' as const },
    );
    try {
      const data = await apiJson<{ rows: CollectionUnpaidOnlineRow[] }>(
        '/api/orders/collection/unpaid-online',
        { token },
      );
      setQueue({ kind: 'ready', rows: data.rows, fetchedAt: Date.now() });
    } catch (err) {
      setQueue({
        kind: 'error',
        message: err instanceof Error ? err.message : 'queue_fetch_failed',
      });
    }
  }, [token, allowed]);

  useEffect(() => {
    if (!allowed) return;
    void refreshQueue();
    const id = window.setInterval(refreshQueue, QUEUE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshQueue, allowed]);

  const queueRows = queue.kind === 'ready' ? queue.rows : [];

  // Aging-bucket grouping for the bottom list.
  const grouped = useMemo(
    () =>
      groupByAgingBucket(
        queueRows,
        (row) => (row as { createdAt?: string }).createdAt ?? new Date().toISOString(),
      ),
    [queueRows],
  );

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
          <div className="space-y-3">
            {grouped.map((group) => (
              <AgingGroup
                key={group.bucket}
                bucket={group.bucket}
                rows={group.rows as CollectionUnpaidOnlineRow[]}
                focusedRowId={focusedRow?.orderId ?? null}
                onFocus={(orderId) => setFocusedRowId(orderId)}
                locale={locale}
                t={t}
              />
            ))}
          </div>
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
    </div>
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

function AgingGroup(props: {
  bucket: AgingBucket;
  rows: CollectionUnpaidOnlineRow[];
  focusedRowId: string | null;
  onFocus: (orderId: string) => void;
  locale: 'en' | 'ar';
  t: ReturnType<typeof useTranslation>['t'];
}): React.ReactElement | null {
  if (props.rows.length === 0) return null;
  const isAr = props.locale === 'ar';
  const sample = props.rows[0];
  const opened = (sample as { createdAt?: string }).createdAt ?? new Date().toISOString();
  const aging = classifyAging({ openedAtIso: opened });
  void aging;
  return (
    <div data-testid={`aging-group-${props.bucket}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <AgingBadge openedAtIso={opened} />
        <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">
          {props.rows.length} {isAr ? 'فاتورة' : 'invoices'}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {props.rows.map((row) => {
          const focused = row.orderId === props.focusedRowId;
          return (
            <li
              key={row.orderId}
              data-testid="cockpit-queue-row"
              tabIndex={0}
              onClick={() => props.onFocus(row.orderId)}
              onFocus={() => props.onFocus(row.orderId)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs transition focus:outline-none ${
                focused
                  ? 'bg-sky-50 ring-2 ring-sky-300 dark:bg-sky-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
              aria-selected={focused}
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-700 dark:text-slate-100">
                  {row.customerName || row.readableId}
                </div>
                <div className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {row.readableId} • {row.customerPhone || '—'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{row.paymentMethod}</Badge>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                  {formatKwdLabelGrouped(row.amountKd)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default CollectionsCockpitPage;
