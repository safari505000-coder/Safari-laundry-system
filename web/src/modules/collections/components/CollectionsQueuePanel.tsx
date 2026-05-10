import { type ReactElement, useMemo, useState } from 'react';
import {
  AgingBadge,
  EmptyState,
  FraudBadge,
  PromiseStatusBadge,
  RiskBadge,
  WindowedList,
  type AgingBucket,
  type FraudSeverity,
  type PromiseStatus,
  type RiskLevel,
} from '@/modules/finance';
import { formatKwdLabel } from '@/lib/kwd';

/**
 * V20.7 — Phase 5 Collections Queue panel.
 *
 * The LEFT pane of the split-view Collections Operations Workspace.
 * Lists every customer in the collector's queue with one-glance
 * signals (aging / risk / fraud / active promise). Supports:
 *
 *   • Search filter
 *   • Aging bucket filter
 *   • Active-promise-only filter
 *   • Click selection — emits the customer id upwards
 *   • Virtualization (handles 5K+ queue rows)
 */

export type QueueCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  remainingDebtKd: string;
  agingBucket?: AgingBucket;
  oldestOverdueDays?: number;
  riskLevel?: RiskLevel;
  fraudSeverity?: FraudSeverity;
  fraudOpenCount?: number;
  activePromise?: { status: PromiseStatus; dueDate?: string | null } | null;
};

export type CollectionsQueuePanelProps = {
  customers: ReadonlyArray<QueueCustomer>;
  loading?: boolean;
  selectedCustomerId?: string | null;
  onSelect: (customerId: string) => void;
  height?: number;
  locale?: 'en' | 'ar';
  className?: string;
};

const AGING_FILTERS: ReadonlyArray<{ id: 'ALL' | AgingBucket; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'CURRENT', label: 'Current' },
  { id: 'LATE', label: 'Late' },
  { id: 'CRITICAL', label: 'Critical' },
  { id: 'LEGAL', label: 'Legal' },
];

export function CollectionsQueuePanel(
  props: CollectionsQueuePanelProps,
): ReactElement {
  const isAr = (props.locale ?? 'ar') === 'ar';
  const [search, setSearch] = useState('');
  const [agingFilter, setAgingFilter] = useState<'ALL' | AgingBucket>('ALL');
  const [promiseOnly, setPromiseOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return props.customers.filter((c) => {
      if (agingFilter !== 'ALL' && c.agingBucket !== agingFilter) return false;
      if (promiseOnly && (!c.activePromise || c.activePromise.status !== 'ACTIVE'))
        return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !(c.phone ?? '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [props.customers, search, agingFilter, promiseOnly]);

  return (
    <aside
      role="navigation"
      aria-label={isAr ? 'قائمة العملاء' : 'Customer queue'}
      className={`flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="space-y-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? 'بحث بالاسم أو الهاتف…' : 'Search name or phone…'}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          aria-label={isAr ? 'بحث' : 'Search'}
        />
        <div className="flex flex-wrap items-center gap-1">
          {AGING_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAgingFilter(f.id)}
              aria-pressed={agingFilter === f.id}
              className={`rounded-md px-2 py-0.5 text-[0.65rem] font-medium ring-1 ${
                agingFilter === f.id
                  ? 'bg-blue-600 text-white ring-blue-700'
                  : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
          <label className="ml-auto inline-flex items-center gap-1 text-[0.65rem] text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={promiseOnly}
              onChange={(e) => setPromiseOnly(e.target.checked)}
            />
            {isAr ? 'وعود فقط' : 'Promises only'}
          </label>
        </div>
        <div className="text-[0.6rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {filtered.length} / {props.customers.length}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا يوجد عملاء يطابقون الفلتر' : 'No customers match the filter'}
          tone="neutral"
        />
      ) : (
        <WindowedList
          items={filtered}
          rowHeight={64}
          height={props.height ?? 540}
          overscan={6}
          renderRow={(c) => (
            <button
              type="button"
              onClick={() => props.onSelect(c.id)}
              aria-pressed={c.id === props.selectedCustomerId}
              className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-start text-xs transition ${
                c.id === props.selectedCustomerId
                  ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                  {c.name}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-rose-700 dark:text-rose-300">
                  {formatKwdLabel(c.remainingDebtKd)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {c.agingBucket ? (
                  <AgingBadge
                    bucket={c.agingBucket}
                    daysOverdue={c.oldestOverdueDays}
                    locale={props.locale}
                  />
                ) : null}
                {c.riskLevel ? (
                  <RiskBadge level={c.riskLevel} locale={props.locale} />
                ) : null}
                {c.fraudSeverity ? (
                  <FraudBadge
                    severity={c.fraudSeverity}
                    count={c.fraudOpenCount}
                    locale={props.locale}
                  />
                ) : null}
                {c.activePromise ? (
                  <PromiseStatusBadge
                    status={c.activePromise.status}
                    dueDate={c.activePromise.dueDate ?? undefined}
                    locale={props.locale}
                  />
                ) : null}
              </div>
            </button>
          )}
        />
      )}
    </aside>
  );
}
