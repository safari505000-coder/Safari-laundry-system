import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DispatchSeverity } from '../api/cc-dashboard-api';

type Props = {
  severity: DispatchSeverity;
  /** Whole minutes since the dispatch was created (server-computed). */
  elapsedMinutes?: number;
  className?: string;
};

const STYLES: Record<DispatchSeverity, string> = {
  ON_TIME:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  LATE: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  CRITICAL:
    'bg-red-50 text-red-700 border border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 animate-pulse',
  COMPLETED:
    'bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-300 dark:border-zinc-700',
};

const ICONS: Record<DispatchSeverity, typeof Clock> = {
  ON_TIME: CheckCircle2,
  LATE: Clock,
  CRITICAL: AlertTriangle,
  COMPLETED: CheckCircle2,
};

export function DispatchSeverityBadge({
  severity,
  elapsedMinutes,
  className,
}: Props) {
  const { t } = useTranslation();
  const Icon = ICONS[severity];

  const label = t(`callCenterDashboard.severity.${severity}`, {
    defaultValue: severity,
  });

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        STYLES[severity],
        className,
      )}
      role="status"
      aria-label={label}
    >
      <Icon className="size-3" aria-hidden />
      <span>{label}</span>
      {typeof elapsedMinutes === 'number' && severity !== 'COMPLETED' ? (
        <span className="opacity-70" aria-hidden>
          · {elapsedMinutes}m
        </span>
      ) : null}
    </span>
  );
}
