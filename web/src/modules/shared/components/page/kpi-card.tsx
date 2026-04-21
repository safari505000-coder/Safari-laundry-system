import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavGroupTone } from '@/modules/shared/nav/nav-types';
import { Card } from '@/modules/shared/components/ui/card';

/**
 * V19.9.5 — Shared KPI card primitive.
 *
 * Replaces the dozen-or-so hand-rolled stat tiles across owner /
 * finance / knet / live-monitor screens. Behaves as a single-row
 * card with:
 *
 *  - top line: small muted label
 *  - main line: bold numeric value (tabular-nums)
 *  - optional: a small right-aligned icon carried in the tone hue
 *  - optional: a small delta/status slot (e.g. +5 د.ك, آخر 30 يوم)
 *  - optional: loading state replaces the value with a spinner
 *
 * All numbers inside `value` / `deltaBadge` should already be
 * formatted by the caller (the app uses Latin digits via
 * `useAppLocale`); this primitive only reserves space + typography.
 */
export type KpiTone = NavGroupTone;

const TONE_ICON: Record<KpiTone, string> = {
  blue: 'text-sky-600 dark:text-sky-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  orange: 'text-orange-600 dark:text-orange-400',
  purple: 'text-violet-600 dark:text-violet-400',
  red: 'text-rose-600 dark:text-rose-400',
  gray: 'text-muted-foreground',
};

type KpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: KpiTone;
  deltaBadge?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function KpiCard({
  label,
  value,
  icon,
  tone,
  deltaBadge,
  loading,
  className,
}: KpiCardProps) {
  return (
    <Card
      size="sm"
      className={cn('flex-row items-start justify-between gap-3 px-4', className)}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            value
          )}
        </p>
        {deltaBadge ? (
          <div className="mt-1 text-xs text-muted-foreground">{deltaBadge}</div>
        ) : null}
      </div>
      {icon ? (
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70',
            tone ? TONE_ICON[tone] : 'text-muted-foreground',
          )}
        >
          {icon}
        </div>
      ) : null}
    </Card>
  );
}
