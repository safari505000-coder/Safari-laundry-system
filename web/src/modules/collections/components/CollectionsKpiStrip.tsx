import { type ReactElement } from 'react';
import { FinancialHealthIndicator } from '@/modules/finance';
import type { ObservabilityOverview } from '@/modules/finance';

/**
 * V20.6 — Phase 7 KPI strip for the Collections Workspace.
 *
 * Reads SERVER-CANONICAL metrics from the
 * `/api/finance/observability/overview` endpoint (Phase 3) and
 * surfaces them in a single compact band. Loading and error are
 * rendered as quiet placeholders so the workspace never goes blank.
 */

export type CollectionsKpiStripProps = {
  overview?: ObservabilityOverview | null;
  loading?: boolean;
  error?: string | null;
  onOpenObservability?: () => void;
  className?: string;
};

export function CollectionsKpiStrip(
  props: CollectionsKpiStripProps,
): ReactElement {
  return (
    <div
      role="region"
      aria-label="Collections KPI strip"
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        props.className ?? ''
      }`}
    >
      {props.loading ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Loading KPIs…
        </span>
      ) : props.error ? (
        <span className="text-xs text-rose-600 dark:text-rose-400">
          KPIs offline
        </span>
      ) : props.overview ? (
        <>
          <FinancialHealthIndicator
            score={props.overview.healthScore}
            onClick={props.onOpenObservability}
          />
          {props.overview.sections.map((s) => (
            <KpiCell
              key={s.key}
              label={s.label}
              value={String(s.metric)}
              status={s.status}
            />
          ))}
        </>
      ) : (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          No KPIs
        </span>
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: ObservabilityOverview['sections'][number]['status'];
}) {
  const tone =
    status === 'CRITICAL'
      ? 'text-rose-700 dark:text-rose-300'
      : status === 'WARNING'
        ? 'text-amber-700 dark:text-amber-300'
        : status === 'DEGRADED'
          ? 'text-blue-700 dark:text-blue-300'
          : 'text-emerald-700 dark:text-emerald-300';
  return (
    <div className="flex flex-col rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/50">
      <span className="text-[0.6rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className={`text-xs font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
