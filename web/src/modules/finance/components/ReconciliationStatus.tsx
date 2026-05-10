import { type ReactElement } from 'react';

/**
 * V20.6 — Phase 6B ReconciliationStatus.
 *
 * Surface for the V20.5 Reconciliation Engine. Shows whether the
 * canonical Journal AR matches the FinancialSnapshot for each branch
 * (or globally) and emphasizes drift loudly.
 */

export type ReconciliationOverallStatus = 'OK' | 'DRIFT' | 'STALE' | 'UNKNOWN';

const STATUS_PRESET: Record<
  ReconciliationOverallStatus,
  { label: string; klass: string; pulse: boolean }
> = {
  OK: {
    label: 'متّزن',
    klass: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
    pulse: false,
  },
  DRIFT: {
    label: 'انحراف مكتشف',
    klass: 'bg-rose-50 text-rose-800 ring-rose-400 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-700',
    pulse: true,
  },
  STALE: {
    label: 'بيانات قديمة',
    klass: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
    pulse: false,
  },
  UNKNOWN: {
    label: 'غير معروف',
    klass: 'bg-slate-50 text-slate-700 ring-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700',
    pulse: false,
  },
};

export type ReconciliationStatusProps = {
  status: ReconciliationOverallStatus;
  lastRunAt?: string | Date | null;
  driftCount?: number;
  branchesScanned?: number;
  className?: string;
  onClick?: () => void;
};

export function ReconciliationStatus(props: ReconciliationStatusProps): ReactElement {
  const preset = STATUS_PRESET[props.status];
  const last = props.lastRunAt
    ? typeof props.lastRunAt === 'string'
      ? new Date(props.lastRunAt)
      : props.lastRunAt
    : null;
  const Wrapper = (props.onClick ? 'button' : 'div') as 'button' | 'div';
  return (
    <Wrapper
      type={props.onClick ? 'button' : undefined}
      onClick={props.onClick}
      aria-label={`Reconciliation status: ${preset.label}`}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 ring-1 ${preset.klass} ${
        props.onClick ? 'cursor-pointer hover:brightness-95' : ''
      } ${props.className ?? ''}`}
    >
      <span
        aria-hidden
        className={`h-2.5 w-2.5 rounded-full bg-current ${preset.pulse ? 'animate-pulse' : ''}`}
      />
      <span className="flex flex-col items-start text-left">
        <span className="text-xs font-bold">{preset.label}</span>
        <span className="text-[0.6rem] opacity-80">
          {last ? `آخر تدقيق: ${last.toLocaleString('en')}` : 'لم يُشغّل بعد'}
          {props.driftCount != null ? ` · انحرافات: ${props.driftCount}` : ''}
          {props.branchesScanned != null ? ` · فروع: ${props.branchesScanned}` : ''}
        </span>
      </span>
    </Wrapper>
  );
}
