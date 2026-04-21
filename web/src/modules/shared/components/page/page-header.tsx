import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { NavGroupTone } from '@/modules/shared/nav/nav-types';

/**
 * V19.9.5 — Shared page header primitive.
 *
 * Every page chrome in the app renders a title + optional subtitle +
 * right-aligned actions. Historically each page rolled its own
 * `<div><h1>...</h1></div>` with slightly different spacing, weight
 * and colour. This primitive standardises the slot so migrations are
 * a 3-line swap per page.
 *
 * `tone` hooks into the same `NavGroupTone` palette as the sidebar
 * so we can optionally colour the title underline (e.g. Finance
 * pages carry a blue hairline, Inventory pages carry orange). Pass
 * `undefined` for the neutral look.
 */
export type PageHeaderTone = NavGroupTone;

const TONE_ACCENT: Record<PageHeaderTone, string> = {
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  orange: 'bg-orange-500',
  purple: 'bg-violet-500',
  red: 'bg-rose-500',
  gray: 'bg-zinc-400',
};

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tone?: PageHeaderTone;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  tone,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold leading-tight text-foreground sm:text-2xl">
          {tone ? (
            <span
              aria-hidden
              className={cn(
                'h-5 w-1 rounded-full',
                TONE_ACCENT[tone],
              )}
            />
          ) : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
