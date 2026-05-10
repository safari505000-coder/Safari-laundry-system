import React from 'react';
import type { WorkflowItem, WorkflowKind, WorkflowQueueSnapshot } from './types';
import { WorkflowItemCard, type WorkflowItemCardProps } from './WorkflowItemCard';

void React;

/**
 * V23.1 Phase 7 — 3-lane operational workspace.
 *
 * Renders three columns side-by-side:
 *   • Callbacks Due
 *   • Active Promises
 *   • Open Escalations
 *
 * Each lane is independently scrollable, sorts by `scheduledAt`
 * (overdue first), and exposes the per-card action callbacks via
 * the same props interface as `WorkflowItemCard`. The component
 * is purely presentational — the parent owns mutation orchestration.
 */

export type WorkflowLaneActions = Pick<
  WorkflowItemCardProps,
  'onOpen' | 'onClaim' | 'onRelease' | 'onComplete' | 'onBreak' | 'onCancel'
>;

export interface WorkflowLanesProps extends WorkflowLaneActions {
  snapshot: WorkflowQueueSnapshot | null;
  loading?: boolean;
  error?: string | null;
  currentOperatorId?: string | null;
  locale?: 'en' | 'ar';
  className?: string;
  /** Whether to render the per-lane "+ add" hint button. */
  onQuickAdd?: (kind: WorkflowKind) => void;
}

const LANE_LABELS: Record<WorkflowKind, { ar: string; en: string }> = {
  CALLBACK: { ar: 'مكالمات مرتجعة', en: 'Callbacks' },
  PROMISE: { ar: 'وعود نشطة', en: 'Active promises' },
  ESCALATION: { ar: 'تصعيدات', en: 'Escalations' },
};

const LANE_ORDER: WorkflowKind[] = ['CALLBACK', 'PROMISE', 'ESCALATION'];

function sortByDueThenPriority(rows: ReadonlyArray<WorkflowItem>): WorkflowItem[] {
  const priorityWeight = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  return rows.slice().sort((a, b) => {
    // Overdue first, then nearest due time, then priority.
    const aDue = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.POSITIVE_INFINITY;
    const bDue = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return (
      priorityWeight[a.priority] - priorityWeight[b.priority] ||
      (a.createdAt < b.createdAt ? -1 : 1)
    );
  });
}

function laneRows(
  snapshot: WorkflowQueueSnapshot | null,
  kind: WorkflowKind,
): WorkflowItem[] {
  if (!snapshot) return [];
  if (kind === 'CALLBACK') return sortByDueThenPriority(snapshot.callbacks);
  if (kind === 'PROMISE') return sortByDueThenPriority(snapshot.promises);
  return sortByDueThenPriority(snapshot.escalations);
}

export function WorkflowLanes(props: WorkflowLanesProps): React.ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  return (
    <section
      className={`grid grid-cols-1 gap-3 lg:grid-cols-3 ${props.className ?? ''}`}
      data-testid="workflow-lanes"
      aria-label={isAr ? 'مسارات العمل التشغيلية' : 'Operational workflow lanes'}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {LANE_ORDER.map((kind) => {
        const rows = laneRows(props.snapshot, kind);
        return (
          <div
            key={kind}
            data-testid={`workflow-lane-${kind.toLowerCase()}`}
            className="flex max-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40"
          >
            <header className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {LANE_LABELS[kind][isAr ? 'ar' : 'en']}
                <span className="ms-2 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {rows.length}
                </span>
              </h3>
              {props.onQuickAdd ? (
                <button
                  type="button"
                  onClick={() => props.onQuickAdd?.(kind)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-[0.7rem] font-medium hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
                  data-testid={`workflow-quick-add-${kind.toLowerCase()}`}
                  aria-label={
                    isAr
                      ? `إضافة ${LANE_LABELS[kind].ar}`
                      : `Add ${LANE_LABELS[kind].en}`
                  }
                >
                  {isAr ? '+ إضافة' : '+ Add'}
                </button>
              ) : null}
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto pe-1">
              {rows.length === 0 ? (
                <div
                  className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  data-testid={`workflow-lane-empty-${kind.toLowerCase()}`}
                >
                  {isAr ? 'لا يوجد عناصر مفتوحة' : 'No open items'}
                </div>
              ) : (
                rows.map((item) => (
                  <WorkflowItemCard
                    key={item.id}
                    item={item}
                    currentOperatorId={props.currentOperatorId}
                    onOpen={props.onOpen}
                    onClaim={props.onClaim}
                    onRelease={props.onRelease}
                    onComplete={props.onComplete}
                    onBreak={props.onBreak}
                    onCancel={props.onCancel}
                    locale={props.locale}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
      {props.error ? (
        <div
          className="col-span-full rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
          role="alert"
        >
          {isAr ? 'تعذر تحميل مسارات العمل' : 'Failed to load workflow lanes'}: {props.error}
        </div>
      ) : null}
      {props.loading && !props.snapshot ? (
        <div
          className="col-span-full text-center text-xs text-slate-500 dark:text-slate-400"
          aria-live="polite"
        >
          {isAr ? 'جاري التحميل...' : 'Loading...'}
        </div>
      ) : null}
    </section>
  );
}
