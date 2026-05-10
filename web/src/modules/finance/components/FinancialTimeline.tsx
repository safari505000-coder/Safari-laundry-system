import { type ReactElement } from 'react';
import { TimelineCard, type TimelineKind } from './TimelineCard';
import { WindowedList } from './WindowedList';

/**
 * V20.7 — Phase 3 FinancialTimeline.
 *
 * Virtualized timeline of financial events for a single customer.
 * Rows must be SERVER-SORTED — this component performs no client
 * resort.
 */

export type FinancialTimelineRow = {
  id: string;
  kind: TimelineKind;
  occurredAt: string | Date;
  title: string;
  description?: string | null;
  amountKd?: string | null;
  reference?: string | null;
  actorName?: string | null;
};

export type FinancialTimelineProps = {
  rows: ReadonlyArray<FinancialTimelineRow>;
  height?: number;
  rowHeight?: number;
  loading?: boolean;
  locale?: 'en' | 'ar';
  emptyText?: string;
  className?: string;
};

export function FinancialTimeline(props: FinancialTimelineProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
      aria-label="Customer financial timeline"
    >
      <WindowedList
        items={props.rows}
        rowHeight={props.rowHeight ?? 96}
        height={props.height ?? 480}
        overscan={4}
        emptyState={
          <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
            {props.loading
              ? isAr
                ? 'جاري التحميل…'
                : 'Loading…'
              : (props.emptyText ?? (isAr ? 'لا توجد أحداث' : 'No events'))}
          </div>
        }
        renderRow={(row) => (
          <div className="px-3 pb-2">
            <TimelineCard
              kind={row.kind}
              occurredAt={row.occurredAt}
              title={row.title}
              description={row.description ?? undefined}
              amountKd={row.amountKd ?? undefined}
              reference={row.reference ?? undefined}
              actorName={row.actorName ?? undefined}
              locale={props.locale}
            />
          </div>
        )}
      />
    </div>
  );
}
