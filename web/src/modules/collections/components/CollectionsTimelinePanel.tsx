import { type ReactElement } from 'react';
import { TimelineCard, WindowedList } from '@/modules/finance';
import type { WorkspaceTimelineRow } from '../types/workspace';

/**
 * V20.6 — Phase 7 Timeline panel for the Collections Workspace.
 *
 * Renders the customer's full event history (server-derived from the
 * canonical Journal) using `WindowedList` virtualization so a 10K+
 * row history scrolls smoothly. Each row is a `TimelineCard` from
 * the Phase 6 UI Kit.
 */

export type CollectionsTimelinePanelProps = {
  rows: ReadonlyArray<WorkspaceTimelineRow>;
  loading?: boolean;
  height?: number;
  className?: string;
  locale?: 'en' | 'ar';
};

export function CollectionsTimelinePanel({
  rows,
  loading,
  height = 480,
  className,
  locale = 'ar',
}: CollectionsTimelinePanelProps): ReactElement {
  return (
    <section
      aria-label="Customer financial timeline"
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        className ?? ''
      }`}
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {locale === 'ar' ? 'الخط الزمني' : 'Timeline'}
        </h3>
        <span className="text-[0.65rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {rows.length} {locale === 'ar' ? 'حدث' : 'events'}
        </span>
      </header>
      {loading && rows.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
          {locale === 'ar' ? 'جاري التحميل…' : 'Loading…'}
        </div>
      ) : (
        <WindowedList
          items={rows}
          rowHeight={88}
          height={height}
          overscan={4}
          emptyState={
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {locale === 'ar' ? 'لا توجد أحداث' : 'No events'}
            </div>
          }
          renderRow={(row) => (
            <div className="px-1 pb-2">
              <TimelineCard
                kind={row.kind}
                occurredAt={row.occurredAt}
                title={row.title}
                description={row.description ?? undefined}
                amountKd={row.amountKd ?? undefined}
                reference={row.reference ?? undefined}
                actorName={row.actorName ?? undefined}
                locale={locale}
              />
            </div>
          )}
        />
      )}
    </section>
  );
}
