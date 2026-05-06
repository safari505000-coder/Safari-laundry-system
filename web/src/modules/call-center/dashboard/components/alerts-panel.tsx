import { useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Flame,
  Lock,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutstandingResponse, OutstandingRow } from '@/modules/call-center/outstanding/api/outstanding-api';

type Severity = 'critical' | 'high' | 'medium' | 'info';

type Alert = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  icon: typeof AlertTriangle;
  /** Up to 3 example customers we surface for "one-click open". */
  examples: { customerId: string; name: string; phone: string }[];
};

type Props = {
  outstanding: OutstandingResponse | null;
  loading: boolean;
  onOpenCustomer: (row: OutstandingRow) => void;
};

const STALE_DAYS = 7;
const VERY_LATE_DAYS = 14;

function severityClasses(s: Severity): { box: string; chip: string } {
  switch (s) {
    case 'critical':
      return {
        box: 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30',
        chip: 'bg-rose-600 text-white',
      };
    case 'high':
      return {
        box: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30',
        chip: 'bg-amber-500 text-amber-950',
      };
    case 'medium':
      return {
        box: 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/30',
        chip: 'bg-sky-500 text-white',
      };
    default:
      return {
        box: 'border-border bg-card',
        chip: 'bg-muted text-foreground',
      };
  }
}

const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

/**
 * Smart Alerts panel — derived 100% from already-fetched
 * `OutstandingResponse` rows and counts. NO new financial logic, NO
 * sums, NO mutations. We classify rows and surface counts/examples so
 * the agent can act in one click. Money values displayed inside an
 * alert always use the per-row backend-supplied `totalDueKd`.
 */
export function AlertsPanel({ outstanding, loading, onOpenCustomer }: Props) {
  const alerts = useMemo<Alert[]>(() => {
    if (!outstanding) return [];
    const rows = outstanding.rows;
    const byId = new Map<string, OutstandingRow>();
    for (const r of rows) byId.set(r.customerId, r);

    const riskRows = rows.filter((r) => r.status === 'RISK');
    const veryLate = rows.filter((r) => r.daysLate >= VERY_LATE_DAYS);
    const blocked = rows.filter((r) => r.blocked);
    const stale = rows.filter((r) => {
      if (r.lastOrderAt === null) return r.daysLate >= STALE_DAYS;
      const last = Date.parse(r.lastOrderAt);
      if (!Number.isFinite(last)) return false;
      const ageMs = Date.now() - last;
      return ageMs >= STALE_DAYS * 86_400_000;
    });
    const noContact = stale.filter((r) => r.priorityScore > 0).slice();

    const items: Alert[] = [];

    if (riskRows.length > 0) {
      items.push({
        id: 'risk-customers',
        severity: 'critical',
        title: `${riskRows.length} عميل في حالة خطر تحصيلي`,
        detail:
          'الحالة "RISK" مرفوعة على هؤلاء العملاء — يحتاجون مكالمة فوريّة وقرار تحصيل أو حظر.',
        icon: Flame,
        examples: riskRows.slice(0, 3).map((r) => ({
          customerId: r.customerId,
          name: r.name ?? r.phone,
          phone: r.phone,
        })),
      });
    }

    if (veryLate.length > 0) {
      items.push({
        id: 'very-late',
        severity: veryLate.length >= 5 ? 'critical' : 'high',
        title: `${veryLate.length} عميل متأخّر أكثر من ${VERY_LATE_DAYS} يوم`,
        detail:
          'الفواتير قديمة. ابدأ بالأعلى مديونية وحدّث حالة التحصيل بعد كل اتصال.',
        icon: AlertOctagon,
        examples: veryLate.slice(0, 3).map((r) => ({
          customerId: r.customerId,
          name: r.name ?? r.phone,
          phone: r.phone,
        })),
      });
    }

    if (noContact.length > 0) {
      items.push({
        id: 'stale-contact',
        severity: 'high',
        title: `${noContact.length} عميل عليه مديونية ولم يتفاعل منذ ${STALE_DAYS}+ أيام`,
        detail:
          'لم تُسجَّل عمليّة لهؤلاء منذ أسبوع — ابدأ بالاتصال أو إرسال رسالة WhatsApp.',
        icon: CalendarClock,
        examples: noContact.slice(0, 3).map((r) => ({
          customerId: r.customerId,
          name: r.name ?? r.phone,
          phone: r.phone,
        })),
      });
    }

    if (blocked.length > 0) {
      items.push({
        id: 'blocked',
        severity: 'medium',
        title: `${blocked.length} عميل محظور — مراجعة قبل الإصدار`,
        detail:
          'الحظر مرفوع منعاً للإصدار. لا تُصدر فاتورة جديدة قبل سداد القديم أو تحديث الحالة.',
        icon: Lock,
        examples: blocked.slice(0, 3).map((r) => ({
          customerId: r.customerId,
          name: r.name ?? r.phone,
          phone: r.phone,
        })),
      });
    }

    items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    return items;
  }, [outstanding]);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      aria-label="تنبيهات ذكية"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-amber-500" aria-hidden />
          <h2 className="text-sm font-semibold">تنبيهات ذكية</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          مشتقّة من قائمة الذمم — بدون أي حسابات إضافيّة
        </span>
      </div>

      {loading && !outstanding ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Clock className="size-4 animate-pulse" aria-hidden />
          جاري قراءة المؤشّرات…
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
          لا توجد تنبيهات حرجة — كل شيء تحت السيطرة.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => {
            const c = severityClasses(alert.severity);
            const Icon = alert.icon;
            return (
              <li
                key={alert.id}
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  c.box,
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon
                    className="mt-0.5 size-4 shrink-0 text-foreground/80"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {alert.title}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          c.chip,
                        )}
                      >
                        {alert.severity === 'critical'
                          ? 'حرج'
                          : alert.severity === 'high'
                            ? 'عاجل'
                            : alert.severity === 'medium'
                              ? 'مهم'
                              : 'ملاحظة'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {alert.detail}
                    </p>
                    {alert.examples.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {alert.examples.map((ex) => {
                          const row = outstanding?.rows.find(
                            (r) => r.customerId === ex.customerId,
                          );
                          return (
                            <li key={ex.customerId}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (row) onOpenCustomer(row);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/90 hover:bg-muted"
                              >
                                <span className="truncate">{ex.name}</span>
                                <ArrowUpRight
                                  className="size-3 opacity-60"
                                  aria-hidden
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
