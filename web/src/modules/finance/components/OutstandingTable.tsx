import { type ReactElement } from 'react';
import { WindowedList } from './WindowedList';
import { PaymentStatusChip, type PaymentStatus } from './PaymentStatusChip';
import { AgingBadge, type AgingBucket } from './AgingBadge';

/**
 * V20.7 — Phase 3 OutstandingTable.
 *
 * Canonical, virtualized outstanding-invoices table. Replaces the
 * hand-rolled tables in `pages/unpaid-invoices-page.tsx`,
 * `pages/all-invoices-page.tsx`, and the call-center outstanding
 * surface. All KD figures are server-canonical strings.
 */

export type OutstandingRow = {
  id: string;
  invoiceCode?: string | null;
  customerName: string;
  customerPhone?: string | null;
  branchName?: string | null;
  issuedAt: string;
  dueDate?: string | null;
  totalKd: string;
  paidKd: string;
  remainingKd: string;
  status: PaymentStatus;
  agingBucket?: AgingBucket;
  daysOverdue?: number;
};

export type OutstandingTableProps = {
  rows: ReadonlyArray<OutstandingRow>;
  loading?: boolean;
  height?: number;
  rowHeight?: number;
  onRowClick?: (row: OutstandingRow) => void;
  emptyState?: React.ReactNode;
  locale?: 'en' | 'ar';
  className?: string;
};

export function OutstandingTable(props: OutstandingTableProps): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const labels = isAr
    ? {
        invoice: 'الفاتورة',
        customer: 'العميل',
        branch: 'الفرع',
        issued: 'تاريخ الإصدار',
        total: 'الإجمالي',
        paid: 'المدفوع',
        remaining: 'المتبقي',
        status: 'الحالة',
        aging: 'التأخر',
      }
    : {
        invoice: 'Invoice',
        customer: 'Customer',
        branch: 'Branch',
        issued: 'Issued',
        total: 'Total',
        paid: 'Paid',
        remaining: 'Remaining',
        status: 'Status',
        aging: 'Aging',
      };

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <header className="grid grid-cols-[120px_minmax(160px,1fr)_120px_110px_110px_110px_110px_120px_110px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
        <span>{labels.invoice}</span>
        <span>{labels.customer}</span>
        <span>{labels.branch}</span>
        <span>{labels.issued}</span>
        <span className="text-end">{labels.total}</span>
        <span className="text-end">{labels.paid}</span>
        <span className="text-end">{labels.remaining}</span>
        <span>{labels.status}</span>
        <span>{labels.aging}</span>
      </header>
      <WindowedList
        items={props.rows}
        rowHeight={props.rowHeight ?? 44}
        height={props.height ?? 480}
        overscan={6}
        emptyState={
          props.emptyState ?? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {props.loading
                ? isAr
                  ? 'جاري التحميل…'
                  : 'Loading…'
                : isAr
                  ? 'لا توجد فواتير قائمة'
                  : 'No outstanding invoices'}
            </div>
          )
        }
        renderRow={(row) => (
          <button
            type="button"
            onClick={() => props.onRowClick?.(row)}
            className="grid w-full grid-cols-[120px_minmax(160px,1fr)_120px_110px_110px_110px_110px_120px_110px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-start text-xs hover:bg-slate-50 disabled:cursor-default dark:border-slate-800 dark:hover:bg-slate-800/40"
            disabled={!props.onRowClick}
          >
            <code className="truncate font-mono text-[0.7rem] text-slate-700 dark:text-slate-300">
              {row.invoiceCode ?? row.id.slice(0, 8)}
            </code>
            <div className="min-w-0">
              <div className="truncate text-slate-800 dark:text-slate-100">
                {row.customerName}
              </div>
              {row.customerPhone ? (
                <div className="truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {row.customerPhone}
                </div>
              ) : null}
            </div>
            <span className="truncate text-slate-600 dark:text-slate-300">
              {row.branchName ?? '—'}
            </span>
            <time className="text-[0.7rem] text-slate-500 dark:text-slate-400">
              {new Date(row.issuedAt).toLocaleDateString(isAr ? 'ar' : 'en')}
            </time>
            <span className="text-end font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {row.totalKd}
            </span>
            <span className="text-end font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {row.paidKd}
            </span>
            <span className="text-end font-bold tabular-nums text-rose-700 dark:text-rose-300">
              {row.remainingKd}
            </span>
            <PaymentStatusChip status={row.status} locale={props.locale} />
            {row.agingBucket ? (
              <AgingBadge
                bucket={row.agingBucket}
                daysOverdue={row.daysOverdue}
                variant="full"
                locale={props.locale}
              />
            ) : (
              <span aria-hidden>—</span>
            )}
          </button>
        )}
      />
    </div>
  );
}
