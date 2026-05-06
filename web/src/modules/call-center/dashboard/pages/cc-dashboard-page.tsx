import { useCallback, useState } from 'react';
import { Headphones } from 'lucide-react';
import { CustomerSearch } from '../components/customer-search';
import { DispatchMonitorPanel } from '../components/dispatch-monitor-panel';
import { KpiStrip } from '../components/kpi-strip';
import { AlertsPanel } from '../components/alerts-panel';
import { CallQueue } from '../components/call-queue';
import { CustomerPanel } from '../components/customer-panel';
import { ActivityFeed } from '../components/activity-feed';
import { useOutstanding } from '@/modules/call-center/outstanding/hooks/use-outstanding';
import type { OutstandingRow } from '@/modules/call-center/outstanding/api/outstanding-api';
import { useCcOperationsSummary } from '../hooks/use-cc-operations-summary';

const EMPTY_FILTERS = Object.freeze({}) as Record<string, never>;

/**
 * Call Center Command Cockpit — `/cc/dashboard`.
 *
 * Five live zones, all driven by existing read-only APIs:
 *  1. Sticky KPI strip — debt, customers, today's collections, invoices.
 *  2. Smart Alerts panel — risk / very-late / stale-contact / blocked.
 *  3. Priority Call Queue — server-sorted by `priorityScore`.
 *  4. Customer 360 side panel — wraps the existing ledger panel.
 *  5. Live Activity Feed + dispatch monitor.
 *
 * STRICT FINANCIAL RULES (DO NOT BREAK):
 *  - `data.totalDueKd` from `/api/finance/outstanding` is rendered
 *    EXACTLY as returned. Per-row `totalDueKd` (number) is rendered
 *    via `Intl.NumberFormat` only — never recomputed or summed.
 *  - `summary.debtRecoveredTodayKd` from
 *    `/api/call-center/operations-summary` is rendered as-is.
 *  - We never call `reduce()` on rows, never cache totals, never
 *    duplicate any backend financial logic.
 *  - The cockpit is a visual layer only; financial truth remains in
 *    `OrdersService.sumCollectionsDebtTotalKd()`.
 */
export function CcDashboardPage() {
  // No filters by default — the cockpit shows the full call-center
  // worklist; per-page filters live on `/cc/collections-report`.
  const outstanding = useOutstanding(EMPTY_FILTERS);
  const summary = useCcOperationsSummary({ pollMs: 30_000 });

  // Hard guard required by the cockpit contract (never break this).
  if (
    outstanding.data &&
    typeof outstanding.data.totalDueKd !== 'string' &&
    typeof outstanding.data.totalDueKd !== 'number'
  ) {
    throw new Error('Invalid totalDue source');
  }

  const [openRow, setOpenRow] = useState<OutstandingRow | null>(null);
  const handleOpen = useCallback((row: OutstandingRow) => {
    setOpenRow(row);
  }, []);
  const handleClose = useCallback(() => setOpenRow(null), []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Headphones className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold">
              لوحة قيادة الكول سنتر
            </h1>
            <p className="text-xs text-muted-foreground">
              صورة فوريّة لحالة التحصيل — اعرف من تتّصل به، شو تقوله، ونفّذ بضغطة واحدة.
            </p>
          </div>
        </div>
        <div className="w-full sm:w-80">
          <CustomerSearch />
        </div>
      </header>

      <KpiStrip
        outstanding={outstanding.data}
        summary={summary.data}
        refreshing={outstanding.refreshing || summary.loading}
        onRefresh={() => {
          outstanding.refresh();
          summary.refresh();
        }}
      />

      {outstanding.error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {outstanding.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <CallQueue
            outstanding={outstanding.data}
            loading={outstanding.loading}
            onOpenCustomer={handleOpen}
          />
          <DispatchMonitorPanel />
        </div>
        <div className="flex flex-col gap-4">
          <AlertsPanel
            outstanding={outstanding.data}
            loading={outstanding.loading}
            onOpenCustomer={handleOpen}
          />
          <ActivityFeed
            outstanding={outstanding.data}
            onOpenCustomer={handleOpen}
          />
        </div>
      </div>

      <CustomerPanel
        open={openRow !== null}
        row={openRow}
        onClose={handleClose}
      />
    </div>
  );
}
