import { Skeleton } from '@/modules/shared/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Stage-F — composite skeleton primitives.
 *
 * The base `Skeleton` is a single grey pulsing rectangle. These
 * higher-level helpers wrap common layouts (KPI row, table, card
 * block) so each page can swap a `<Loader2 />` spinner for a
 * content-shaped placeholder with one line. Keeps the perceived
 * loading experience consistent across the dashboard, the inventory
 * report, the insights tabs, and the HR workbenches.
 */

/**
 * Horizontal row of KPI tiles. Matches the KpiTile sizing used by the
 * insights dashboard, inventory summary header, and executive cards.
 */
export function KpiRowSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-4',
        className,
      )}
      aria-busy
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
      ))}
    </div>
  );
}

/**
 * Generic table placeholder — N rows × M columns. The first column is
 * slightly narrower to mimic an "icon / ID" column; the rest share
 * the remaining width evenly. Use `headerLines` to mimic the
 * caption+filters bar above the table.
 */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  withHeader = true,
  className,
}: {
  rows?: number;
  columns?: number;
  withHeader?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('space-y-2', className)}
      aria-busy
      aria-live="polite"
    >
      {withHeader ? (
        <div className="flex items-center gap-2 pb-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <div className="ms-auto flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <div className="flex gap-2 border-b bg-muted/40 p-2">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-3', i === 0 ? 'w-10' : 'flex-1')}
            />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-2 border-b p-2 last:border-b-0">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-4', c === 0 ? 'w-10' : 'flex-1')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Generic card placeholder (title + body lines). Useful for cards
 * that render a single description block, e.g. the weekly executive
 * report list tile or the manager custody summary card.
 */
export function CardSkeleton({
  lines = 3,
  withTitle = true,
  className,
}: {
  lines?: number;
  withTitle?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('space-y-3 rounded-lg border p-4', className)}
      aria-busy
      aria-live="polite"
    >
      {withTitle ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      ) : null}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Chart placeholder: a tall rounded block with a faint baseline. Used
 * by the insights cash-forecast and anomaly panels while the series
 * is loading.
 */
export function ChartSkeleton({
  height = 180,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded border bg-slate-50 p-2', className)}
      style={{ height }}
      aria-busy
      aria-live="polite"
    >
      <div className="relative h-full w-full overflow-hidden rounded">
        <Skeleton className="h-full w-full" />
        <div className="absolute inset-x-2 bottom-6 h-px bg-slate-200" />
      </div>
    </div>
  );
}

/**
 * Inline skeleton for `<tbody>` — renders N `<tr>` rows with M cells
 * each so a loading table doesn't collapse the layout. Use inside
 * existing `<table>` elements where swapping the full-card Skeleton
 * would reshape the header.
 */
export function TableBodySkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t" aria-busy>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="p-3">
              <Skeleton className={cn('h-3', c === 0 ? 'w-16' : 'w-full')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Compact list-item row skeleton (icon + title + subtitle + trailing
 * action). For archive lists (weekly reports), leave requests,
 * loans, and so on.
 */
export function ListItemSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <ul
      className={cn('divide-y rounded-lg border', className)}
      aria-busy
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  );
}
