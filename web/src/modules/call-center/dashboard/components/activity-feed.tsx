import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ClockAlert,
  Hourglass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  OutstandingResponse,
  OutstandingRow,
} from '@/modules/call-center/outstanding/api/outstanding-api';

type ActivityItem = {
  id: string;
  iconTone: 'rose' | 'amber' | 'sky' | 'emerald';
  icon: typeof Activity;
  title: string;
  detail: string;
  whenIso: string | null;
  row: OutstandingRow;
};

type Props = {
  outstanding: OutstandingResponse | null;
  onOpenCustomer: (row: OutstandingRow) => void;
};

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 30) return `قبل ${days} يوم`;
  if (days < 60) return 'قبل شهر';
  return `قبل ${Math.floor(days / 30)} أشهر`;
}

function toneClasses(tone: ActivityItem['iconTone']): string {
  switch (tone) {
    case 'rose':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200';
    case 'amber':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
    case 'sky':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200';
    default:
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200';
  }
}

/**
 * Live Activity Feed — built from the same outstanding payload that
 * already polls every focus / refresh tick. Surfaces:
 *   - newest invoices that flipped into the outstanding bucket
 *     (using `lastOrderAt` as the most recent activity timestamp);
 *   - oldest still-open invoices ("متأخّر منذ ٣٠ يوم …");
 *   - blocked / risk customers as a constant ticker.
 *
 * No new API calls. No money math. Each item is a one-click jump to
 * the existing Customer 360 side panel.
 */
export function ActivityFeed({ outstanding, onOpenCustomer }: Props) {
  const items = useMemo<ActivityItem[]>(() => {
    if (!outstanding) return [];

    const rows = outstanding.rows;
    const recent = [...rows]
      .filter((r) => r.lastOrderAt !== null)
      .sort((a, b) => {
        const aMs = Date.parse(a.lastOrderAt ?? '') || 0;
        const bMs = Date.parse(b.lastOrderAt ?? '') || 0;
        return bMs - aMs;
      })
      .slice(0, 6);

    const oldest = [...rows]
      .filter((r) => r.earliestDueDate !== null)
      .sort((a, b) => {
        const aMs = Date.parse(a.earliestDueDate ?? '') || 0;
        const bMs = Date.parse(b.earliestDueDate ?? '') || 0;
        return aMs - bMs;
      })
      .slice(0, 3);

    const out: ActivityItem[] = [];
    for (const row of recent) {
      out.push({
        id: `recent-${row.customerId}`,
        iconTone: 'sky',
        icon: CalendarDays,
        title: row.name ?? row.phone,
        detail: `أحدث عمليّة لعميل عليه مديونيّة (${row.invoicesCount} فاتورة)`,
        whenIso: row.lastOrderAt,
        row,
      });
    }
    for (const row of oldest) {
      if (out.some((i) => i.row.customerId === row.customerId)) continue;
      out.push({
        id: `oldest-${row.customerId}`,
        iconTone: row.daysLate >= 14 ? 'rose' : 'amber',
        icon: row.daysLate >= 14 ? AlertTriangle : Hourglass,
        title: row.name ?? row.phone,
        detail: `أقدم فاتورة مستحقّة منذ ${row.daysLate} يوم`,
        whenIso: row.earliestDueDate,
        row,
      });
    }
    return out.slice(0, 8);
  }, [outstanding]);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="الموجز الحيّ"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-emerald-600" aria-hidden />
          <h2 className="text-sm font-semibold">الموجز الحيّ</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          يُحدَّث تلقائياً مع تحديث الذمم
        </span>
      </header>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
          <ClockAlert className="size-4" aria-hidden />
          لا توجد أحداث لعرضها بعد.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenCustomer(item.row)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-start transition-colors hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      toneClasses(item.iconTone),
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(item.whenIso)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <ArrowUpRight
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
