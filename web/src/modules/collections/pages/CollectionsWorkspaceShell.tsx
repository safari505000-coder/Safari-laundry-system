import { type ReactElement, useMemo } from 'react';
import {
  CollectionsKpiStrip,
} from '../components/CollectionsKpiStrip';
import {
  CollectionsQueuePanel,
  type QueueCustomer,
} from '../components/CollectionsQueuePanel';
import {
  CollectionsQuickActionsPanel,
  type QuickShortcut,
} from '../components/CollectionsQuickActionsPanel';
import {
  CollectionsTimelinePanel,
} from '../components/CollectionsTimelinePanel';
import {
  CustomerFinancialHeader,
  EmptyState,
  FinancialErrorBoundary,
  type ObservabilityOverview,
} from '@/modules/finance';
import { useCollectorShortcuts } from '../hooks/use-collector-shortcuts';
import type {
  WorkspaceTimelineRow,
  WorkspaceNote,
} from '../types/workspace';
import type { CollectionsHeroData } from '../components/CollectionsWorkspaceHero';

/**
 * V20.7 — Phase 5 Collections Operations Workspace Shell.
 *
 * Three-pane split-view replacement for the V20.6 single-column
 * `CollectionsOperationsWorkspace`. Layout:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ KPI strip (sticky)                                      │
 *   ├──────────┬───────────────────────────────┬──────────────┤
 *   │ LEFT     │ CENTER                        │ RIGHT        │
 *   │ Queue    │ Sticky financial header       │ Quick action │
 *   │ + filter │ Outstanding invoices          │ shortcuts    │
 *   │          │ Timeline                      │ Notes        │
 *   │          │ Notes                         │ Last action  │
 *   └──────────┴───────────────────────────────┴──────────────┘
 *
 * Keyboard-first: Alt+P (pay), Alt+M (promise), Alt+E (escalate),
 * Alt+N (note), Alt+S (next customer).
 *
 * The shell is **presentational** — all data + callbacks come in via
 * props. The route owner is responsible for wiring `useFinancialQuery`
 * + auth + dispatch. This keeps the shell unit-testable in isolation.
 */

export type CollectionsWorkspaceShellProps = {
  // Queue (left pane)
  queue: ReadonlyArray<QueueCustomer>;
  queueLoading?: boolean;
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string) => void;
  onNextCustomer?: () => void;

  // Center pane
  hero: CollectionsHeroData | null;
  timeline: ReadonlyArray<WorkspaceTimelineRow>;
  timelineLoading?: boolean;
  notes: ReadonlyArray<WorkspaceNote>;

  // KPI strip
  observability?: ObservabilityOverview | null;
  observabilityLoading?: boolean;
  observabilityError?: string | null;

  // Right pane callbacks
  onRecordPayment: () => void;
  onSchedulePromise: () => void;
  onEscalate: () => void;
  onAddNote: () => void;
  onOpenObservability?: () => void;
  onOpenFraud?: () => void;

  // Last-action audit footer
  lastActionLabel?: string | null;
  lastActionAt?: string | null;

  locale?: 'en' | 'ar';
  className?: string;
};

export function CollectionsWorkspaceShell(
  props: CollectionsWorkspaceShellProps,
): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';

  const shortcutMap = useMemo(
    () => ({
      'Alt+P': props.onRecordPayment,
      'Alt+M': props.onSchedulePromise,
      'Alt+E': props.onEscalate,
      'Alt+N': props.onAddNote,
      ...(props.onNextCustomer ? { 'Alt+S': props.onNextCustomer } : {}),
    }),
    [
      props.onRecordPayment,
      props.onSchedulePromise,
      props.onEscalate,
      props.onAddNote,
      props.onNextCustomer,
    ],
  );

  useCollectorShortcuts(shortcutMap);

  const shortcuts: QuickShortcut[] = [
    {
      id: 'pay',
      label: isAr ? 'تسجيل دفعة' : 'Record payment',
      shortcutLabel: 'Alt+P',
      tone: 'success',
      onClick: props.onRecordPayment,
      disabled: !props.hero,
    },
    {
      id: 'promise',
      label: isAr ? 'وعد بالسداد' : 'Schedule promise',
      shortcutLabel: 'Alt+M',
      tone: 'primary',
      onClick: props.onSchedulePromise,
      disabled: !props.hero,
    },
    {
      id: 'escalate',
      label: isAr ? 'تصعيد' : 'Escalate',
      shortcutLabel: 'Alt+E',
      tone: 'warn',
      onClick: props.onEscalate,
      disabled: !props.hero,
    },
    {
      id: 'note',
      label: isAr ? 'إضافة ملاحظة' : 'Add note',
      shortcutLabel: 'Alt+N',
      tone: 'ghost',
      onClick: props.onAddNote,
      disabled: !props.hero,
    },
    ...(props.onNextCustomer
      ? [
          {
            id: 'next',
            label: isAr ? 'العميل التالي' : 'Next customer',
            shortcutLabel: 'Alt+S',
            tone: 'ghost' as const,
            onClick: props.onNextCustomer,
          },
        ]
      : []),
  ];

  return (
    <main
      className={`flex min-h-screen flex-col gap-3 p-3 lg:p-4 ${props.className ?? ''}`}
      dir={isAr ? 'rtl' : 'ltr'}
      aria-label="Collections Operations Workspace (split-view)"
    >
      <CollectionsKpiStrip
        overview={props.observability}
        loading={props.observabilityLoading}
        error={props.observabilityError}
        onOpenObservability={props.onOpenObservability}
      />

      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <CollectionsQueuePanel
          customers={props.queue}
          loading={props.queueLoading}
          selectedCustomerId={props.selectedCustomerId}
          onSelect={props.onSelectCustomer}
          locale={props.locale}
        />

        <FinancialErrorBoundary>
          {props.hero ? (
            <section className="flex flex-col gap-3" aria-label="Customer detail center">
              <CustomerFinancialHeader
                customerName={props.hero.customerName}
                customerPhone={props.hero.customerPhone ?? undefined}
                remainingDebtKd={props.hero.remainingDebtKd}
                walletBalanceKd={props.hero.walletBalanceKd}
                agingBucket={props.hero.agingBucket}
                oldestOverdueDays={props.hero.oldestOverdueDays}
                riskLevel={props.hero.riskLevel}
                riskScore={props.hero.riskScore}
                fraudSeverity={props.hero.fraudSeverity}
                fraudOpenCount={props.hero.fraudOpenCount}
                collectionsStage={props.hero.collectionsStage}
                locale={props.locale}
              />
              <CollectionsTimelinePanel
                rows={props.timeline}
                loading={props.timelineLoading}
                locale={props.locale}
              />
              <NotesInline notes={props.notes} locale={props.locale} />
            </section>
          ) : (
            <EmptyState
              title={isAr ? 'اختر عميلاً من القائمة' : 'Pick a customer from the queue'}
              description={
                isAr
                  ? 'سيظهر هنا الملخص المالي والخط الزمني والملاحظات.'
                  : 'Their financial summary, timeline, and notes will appear here.'
              }
              tone="neutral"
            />
          )}
        </FinancialErrorBoundary>

        <CollectionsQuickActionsPanel
          shortcuts={shortcuts}
          lastActionLabel={props.lastActionLabel ?? null}
          lastActionAt={props.lastActionAt ?? null}
          locale={props.locale}
        />
      </div>
    </main>
  );
}

function NotesInline({
  notes,
  locale = 'ar',
}: {
  notes: ReadonlyArray<WorkspaceNote>;
  locale?: 'en' | 'ar';
}): ReactElement | null {
  if (notes.length === 0) return null;
  return (
    <section
      aria-label="Recent collector notes"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {locale === 'ar' ? 'الملاحظات الأخيرة' : 'Recent notes'}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {notes.slice(0, 4).map((n) => (
          <li
            key={n.id}
            className="rounded-md bg-slate-50 p-1.5 text-[0.7rem] dark:bg-slate-800/40"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {n.authorName}
              </span>
              <time className="text-[0.6rem] text-slate-500 dark:text-slate-400">
                {new Date(n.createdAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
              </time>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {n.bodyMd}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
