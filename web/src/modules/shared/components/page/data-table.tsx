import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/modules/shared/components/ui/table';

/**
 * V19.9.5 — Shared data-table shell.
 *
 * Standardises:
 *  - rounded-xl card container + muted border (no double shadow)
 *  - sticky header (works inside a scroll container)
 *  - empty-state slot (shown when `empty` is truthy and there are
 *    no children to render)
 *  - loading-state slot (spinner / skeleton)
 *
 * Columns + rows are still provided by the caller via `<TableBody>`
 * + `<TableRow>` so existing pages can migrate incrementally: they
 * just wrap their Table with `DataTableShell` and get consistent
 * borders / empty-state for free.
 *
 * Usage:
 *
 *   <DataTableShell
 *     columns={[
 *       { key: 'date', label: 'التاريخ' },
 *       { key: 'amount', label: 'المبلغ', align: 'end', numeric: true },
 *     ]}
 *     empty={rows.length === 0}
 *     emptyState={<p>لا توجد بيانات</p>}
 *   >
 *     {rows.map(r => <TableRow key={r.id}>...</TableRow>)}
 *   </DataTableShell>
 */
export type DataTableColumn = {
  key: string;
  label: ReactNode;
  /** Defaults to `start`. `end` right-aligns inside LTR / flips in RTL. */
  align?: 'start' | 'center' | 'end';
  /** When true the column gets `tabular-nums` for even digit widths. */
  numeric?: boolean;
  /** Optional tailwind class applied to the <th>. */
  className?: string;
};

type DataTableShellProps = {
  columns: DataTableColumn[];
  children: ReactNode;
  empty?: boolean;
  emptyState?: ReactNode;
  loading?: boolean;
  loadingState?: ReactNode;
  className?: string;
  /** Max height for internal scroll (e.g. 'max-h-[70vh]'). Omit for natural flow. */
  scrollClassName?: string;
};

export function DataTableShell({
  columns,
  children,
  empty,
  emptyState,
  loading,
  loadingState,
  className,
  scrollClassName,
}: DataTableShellProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <div className={cn('overflow-x-auto', scrollClassName)}>
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.align === 'end' && 'text-end',
                    col.align === 'center' && 'text-center',
                    col.numeric && 'tabular-nums',
                    col.className,
                  )}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {loadingState ?? 'جار التحميل…'}
                </td>
              </TableRow>
            ) : empty ? (
              <TableRow>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyState ?? 'لا توجد بيانات'}
                </td>
              </TableRow>
            ) : (
              children
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
